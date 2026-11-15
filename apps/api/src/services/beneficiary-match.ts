import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { HELPED_STATES } from '@css/shared';
import { MATCH_ROWS_SHOWN, MATCH_TOTAL_CAP, type MatchRequest } from '@css/shared/beneficiaries';
import { z } from 'zod';
import type { Scope } from '../access/scope.js';
import type { AccessService } from '../access/service.js';
import { reachedProjects, reachesProject } from '../applications/callers.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Principal } from '../auth/principal.js';
import type { Env } from '../config/env.js';
import type { Clock } from '../core/clock.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import { ApiError } from '../i18n/api-error.js';
import { dhakaDayStart, type PersonKeys, samePersonSql } from './beneficiary-identity.js';
import type { MatchKeysService, ProfileKeys } from './match-keys.js';
import { IDENTITY_RULES_SELECT, identityRulesOf } from './project-identity-rules.js';
import type { SettingsService } from './settings.js';

/**
 * How long a pick token stays good: a form taken on a phone without network may wait days before
 * it reaches the server, and an expired token still reaches the office as a person to compare.
 */
export const PICK_TOKEN_TTL_MS = 7 * 24 * 60 * 60_000;
/** The one answer to a pick token that is forged, altered, another caller's or another project's. */
export const PICK_INVALID = 'beneficiary.pick_invalid';
/** The answer past the day's number of name lookups. */
export const MATCH_LIMIT = 'beneficiary.match_limit';
/** The answer where the project requires the document: nobody is looked up or picked by name there. */
export const MATCH_NOT_OPEN = 'beneficiary.match_not_open';
/** The answer to an identity number, typed beside a picked person, that another profile holds. */
export const PICK_NUMBER_CONFLICT = 'beneficiary.pick_number_conflict';

const IV_BYTES = 12;
const TAG_BYTES = 16;
/** Kept apart from every other use of the secret by its own label. */
const PICK_KEY_LABEL = 'beneficiary-pick-token';
/** The key of the digest of a lookup's keys in its audit row, apart from the token's. */
const PROBE_KEY_LABEL = 'beneficiary-match-probe';

const pickPayloadSchema = z.strictObject({
  u: z.string(),
  p: z.string(),
  b: z.string(),
  e: z.number(),
});
/** What a pick token carries: the caller, the project, the person and when it ends. */
type PickPayload = z.infer<typeof pickPayloadSchema>;

/** The person a good pick token names, and whether its time has run out. */
export interface PickedPerson {
  beneficiaryId: string;
  expired: boolean;
}

export interface MatchViewer {
  principal: Principal;
  /** The route's scope: `beneficiary.match` on the projects the caller works on. */
  scope: Scope;
}

/** A project of the person's help, named only where the caller works on it. */
export interface HelpedProject {
  name: { bn: string; en: string };
  year: number;
}

/** One person the name lookup shows: what a volunteer may see of someone already here. */
export interface MatchRow {
  name: string;
  fatherOrHusbandName: string;
  village: string;
  /** The years the person was helped (an application approved or further), oldest first. */
  helpedYears: number[];
  /** Those of the person's helped projects the caller works on. */
  projects: HelpedProject[];
  /**
   * Whether the person may be picked here; why not (the block list, or an application already in
   * this project) is not said, so the answer tells neither.
   */
  pickable: boolean;
  /** Starts an application for this person, for this caller and project. */
  pickToken: string | null;
}

export interface MatchAnswer {
  /** How many people match, counted up to one past the ones shown. */
  total: number;
  people: MatchRow[];
}

/**
 * The name lookup of an application without a document (docs/security/RBAC.md, the lookup of a
 * person without a document): an exact comparison of keys, never a search, open only on a project
 * that asks the document "if they have one". The keys of the name, the father's or husband's name
 * and the village must all equal a live profile's, inside a union of an area of a project the
 * caller works on; the answer shows at most five people and says whether there are more (never how
 * many), each with the name, the father's or husband's name and the village as written, the years
 * of their help and the names of those of their projects the caller works on; never a number, a
 * contact, the family, a document flag, a BEN number or an id. A person who cannot be picked here
 * (blocked, or already applied in this project) is shown without a token and without the reason.
 * Every call is audited, with a keyed digest of the keys it compared (never a name), and counted
 * per caller and day, found or not.
 *
 * Each person who may be picked carries a pick token: the caller, the project, the person and an
 * expiry, sealed with AES-256-GCM under a key derived from the server's cursor secret. Its tag
 * authenticates it as an HMAC would, and the seal keeps the person's id unreadable on the phone,
 * since the answer names no id. An application is started for a picked person only with it.
 */
export class BeneficiaryMatchService {
  private readonly key: Buffer;
  private readonly probeKey: Buffer;

  constructor(
    env: Pick<Env, 'CURSOR_SECRET'>,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditWriter,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly matchKeys: MatchKeysService,
  ) {
    this.key = createHmac('sha256', env.CURSOR_SECRET).update(PICK_KEY_LABEL).digest();
    this.probeKey = createHmac('sha256', env.CURSOR_SECRET).update(PROBE_KEY_LABEL).digest();
  }

  async match(viewer: MatchViewer, body: MatchRequest): Promise<MatchAnswer> {
    const { principal } = viewer;
    if (!(await reachesProject(this.prisma, principal, viewer.scope, body.projectId))) {
      this.access.denied(principal.userId, viewer.scope.permission, 'project');
      throw new ApiError('permission.denied', 403);
    }
    await this.assertOpen(this.prisma, body.projectId);
    await this.assertUnionInProject(principal, viewer.scope.permission, body);
    const limit = await this.settings.get('lookup.match_daily_limit');
    const answer = await this.prisma.$transaction(async (tx) => {
      // one user's lookups run one after another, so parallel requests cannot pass the daily count
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'match:' + principal.userId}))`;
      const today = await tx.auditLog.count({
        where: {
          actorUserId: principal.userId,
          action: 'beneficiary.matched',
          createdAt: { gte: dhakaDayStart(this.clock.now()) },
        },
      });
      const person = {
        name: body.name,
        fatherOrHusbandName: body.fatherOrHusbandName,
        unionId: body.unionId,
        village: body.village,
        guardianRelationCode: body.guardianRelationCode ?? null,
      };
      const keys = await this.matchKeys.ofProfile(tx, person);
      // the person asked about, traceable across calls without the name it was asked by
      const where = {
        projectId: body.projectId,
        unionId: body.unionId,
        keysDigest: this.digestOf(keys),
      };
      if (today >= limit) {
        await this.audit.record(tx, {
          action: 'beneficiary.matched',
          entityType: 'beneficiary',
          new: { ...where, limited: true },
        });
        // the refusal is answered after the commit, so its audit row stays
        return null;
      }
      const found = await this.find(tx, body.projectId, person, keys);
      await this.audit.record(tx, {
        action: 'beneficiary.matched',
        entityType: 'beneficiary',
        new: { ...where, found: found.length },
      });
      return found;
    });
    if (!answer) throw new ApiError(MATCH_LIMIT, 429);
    return this.shown(principal, viewer.scope, body.projectId, answer);
  }

  /** 422 where the project requires the document: nobody is looked up or picked by name there. */
  async assertOpen(db: Tx | PrismaService, projectId: string): Promise<void> {
    const project = await db.project.findUniqueOrThrow({
      where: { id: projectId },
      select: IDENTITY_RULES_SELECT,
    });
    if (identityRulesOf(project).document !== 'optional') throw new ApiError(MATCH_NOT_OPEN, 422);
  }

  /**
   * The person a pick token names, for the caller and the project of a new application: 422 for a
   * token that is forged, altered, another caller's or another project's. An expired token still
   * names its person, marked expired: the caller sends such an application to the office's
   * verification instead of binding it. Whether the person is still live and may apply is the
   * caller's check, in the transaction that binds them.
   */
  pickedPerson(principal: Principal, projectId: string, token: string): PickedPerson {
    const payload = this.open(token);
    if (!payload || payload.u !== principal.userId || payload.p !== projectId)
      throw new ApiError(PICK_INVALID, 422);
    return { beneficiaryId: payload.b, expired: payload.expired };
  }

  /** Seals a pick token: the lookup's own tokens, and the tests' tokens of a given expiry. */
  seal(payload: PickPayload): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv, { authTagLength: TAG_BYTES });
    const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url');
  }

  /** The payload of an authentic token, marked whether its time has run out; null otherwise. */
  private open(token: string): (PickPayload & { expired: boolean }) | null {
    try {
      const raw = Buffer.from(token, 'base64url');
      if (raw.length <= IV_BYTES + TAG_BYTES) return null;
      const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, IV_BYTES), {
        authTagLength: TAG_BYTES,
      });
      decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
      const text = Buffer.concat([
        decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)),
        decipher.final(),
      ]).toString('utf8');
      const parsed = pickPayloadSchema.safeParse(JSON.parse(text));
      if (!parsed.success) return null;
      return { ...parsed.data, expired: parsed.data.e <= this.clock.now().getTime() };
    } catch {
      return null;
    }
  }

  /** A keyed digest of the name key and the father's or husband's name key, never the keys. */
  private digestOf(keys: ProfileKeys): string {
    return createHmac('sha256', this.probeKey)
      .update(JSON.stringify([keys.nameKey, keys.guardianKey]))
      .digest('base64url');
  }

  /**
   * The union must be an active union inside an area of the project: an area is a division, a
   * district, an upazila or a union, so the union or one of its ancestors is the area's place.
   */
  private async assertUnionInProject(
    principal: Principal,
    permission: string,
    body: MatchRequest,
  ): Promise<void> {
    const [row] = await this.prisma.$queryRaw<{ is_union: boolean; inside: boolean }[]>`
      WITH RECURSIVE chain AS (
        SELECT id, parent_id FROM locations WHERE id = ${body.unionId}::uuid
        UNION ALL
        SELECT l.id, l.parent_id FROM locations l JOIN chain c ON l.id = c.parent_id
      )
      SELECT
        EXISTS (SELECT 1 FROM locations
                WHERE id = ${body.unionId}::uuid AND level = 'union' AND active) AS is_union,
        EXISTS (SELECT 1 FROM project_areas pa JOIN chain c ON c.id = pa.location_id
                WHERE pa.project_id = ${body.projectId}::uuid) AS inside`;
    if (!row?.is_union)
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'unionId', code: 'validation.option_unknown' },
      ]);
    if (!row.inside) {
      this.access.denied(principal.userId, permission, 'project');
      throw new ApiError('permission.denied', 403);
    }
  }

  /**
   * The live profiles whose keys equal the input's in the union, by BEN number: the ones shown and
   * one more, which only says that there are more. Each says whether it may be picked here: not on
   * the block list, and no live application in this project (the rule of one per project).
   */
  private async find(tx: Tx, projectId: string, person: PersonKeys, keys: ProfileKeys) {
    return tx.$queryRaw<
      {
        id: string;
        name: string;
        father_or_husband_name: string;
        village: string;
        pickable: boolean;
      }[]
    >`
      SELECT b.id, b.name, b.father_or_husband_name, b.village,
        NOT b.is_blocked AND NOT EXISTS (
          SELECT 1 FROM applications a
           WHERE a.project_id = ${projectId}::uuid
             AND a.beneficiary_id = b.id
             AND a.status <> 'deleted'
        ) AS pickable
      FROM beneficiaries b
      WHERE b.merged_into_id IS NULL AND ${samePersonSql(person, keys)}
      ORDER BY b.ben_no
      LIMIT ${MATCH_TOTAL_CAP}`;
  }

  /** The rows as the caller may see them, with the help and the tokens. */
  private async shown(
    principal: Principal,
    scope: Scope,
    projectId: string,
    found: Awaited<ReturnType<BeneficiaryMatchService['find']>>,
  ): Promise<MatchAnswer> {
    const rows = found.slice(0, MATCH_ROWS_SHOWN);
    const ids = rows.map((r) => r.id);
    const helped = ids.length
      ? await this.prisma.$queryRaw<
          {
            beneficiary_id: string;
            project_id: string;
            year: number;
            name_bn: string;
            name_en: string;
          }[]
        >`
          SELECT DISTINCT a.beneficiary_id, p.id AS project_id, p.year, p.name_bn, p.name_en
          FROM applications a JOIN projects p ON p.id = a.project_id
          WHERE a.beneficiary_id = ANY(${ids}::uuid[])
            AND a.status = ANY(${[...HELPED_STATES]}::text[])
          ORDER BY p.year, p.name_en`
      : [];
    // a project is named only where the caller works on it, all of them read at once
    const worked = await reachedProjects(
      this.prisma,
      principal,
      scope,
      helped.map((h) => h.project_id),
    );
    const expires = this.clock.now().getTime() + PICK_TOKEN_TTL_MS;
    return {
      total: found.length,
      people: rows.map((r) => {
        const own = helped.filter((h) => h.beneficiary_id === r.id);
        return {
          name: r.name,
          fatherOrHusbandName: r.father_or_husband_name,
          village: r.village,
          helpedYears: [...new Set(own.map((h) => h.year))].sort((a, b) => a - b),
          projects: own
            .filter((h) => worked.has(h.project_id))
            .map((h) => ({ name: { bn: h.name_bn, en: h.name_en }, year: h.year })),
          pickable: r.pickable,
          pickToken: r.pickable
            ? this.seal({ u: principal.userId, p: projectId, b: r.id, e: expires })
            : null,
        };
      }),
    };
  }
}
