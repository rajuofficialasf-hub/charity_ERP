import type { Bilingual } from '@css/shared/i18n';
import {
  CONTENT_TYPES,
  isSystemStage,
  MEDIA_PRIORITIES,
  REFERRAL_STATES,
  type ReferralState,
  youtubeId,
} from '@css/shared/media';
import { mediaScriptSchema } from '@css/shared';
import { z } from 'zod';
import { holdsPermission, mediaReferralWhere, type Scope } from '../access/scope';
import type { AccessService } from '../access/service';
import type { Principal } from '../auth/principal';
import type { Env } from '../config/env';
import {
  buildPage,
  decodeCursor,
  keysetWhere,
  orderBy,
  type PageQuery,
  parseList,
  parseSort,
} from '../core/pagination';
import type { PrismaService, Tx } from '../core/prisma.service';
import { MANAGE_PERMISSION } from './media-work-view';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';

/** The roles whose holders have a media member's profile. */
const MEDIA_ROLES = ['media_team', 'media_director', 'media_assistant_director'];

const uuid = z.uuid();
const bilingual = z.object({ bn: z.string(), en: z.string() });
const place = {
  program: z.object({ id: uuid, name: bilingual }),
  project: z.object({ id: uuid, name: bilingual, year: z.number().int() }),
};

/** The home's counts: the referrals by their decision, the works by their stage group. */
const countsView = z.object({
  referrals: z.number().int(),
  new: z.number().int(),
  inReview: z.number().int(),
  inProgress: z.number().int(),
  waitingForShooting: z.number().int(),
  inEditing: z.number().int(),
  published: z.number().int(),
  done: z.number().int(),
  rejected: z.number().int(),
});
type Counts = z.infer<typeof countsView>;

export const mediaSummaryView = z.object({
  overall: countsView,
  programs: z.array(z.object({ program: place.program, counts: countsView })),
});

/** One row of the works list: a referral, with its work once accepted. */
export const mediaWorkRow = z.object({
  referralId: uuid,
  workId: uuid.nullable(),
  title: z.string().nullable(),
  beneficiaryName: z.string(),
  ...place,
  members: z.array(z.object({ userId: uuid, name: z.string() })),
  state: z.enum(REFERRAL_STATES),
  stageCode: z.string().nullable(),
  priority: z.enum(MEDIA_PRIORITIES),
  referredAt: z.string(),
  updatedAt: z.string(),
});
type WorkRow = z.infer<typeof mediaWorkRow>;

export const mediaWorkQuerySchema = z.strictObject({
  programId: uuid.optional(),
  /** Comma lists. */
  stage: z.string().max(400).optional(),
  priority: z.string().max(50).optional(),
  state: z.string().max(100).optional(),
  memberId: uuid.optional(),
});
export type MediaWorkQuery = z.infer<typeof mediaWorkQuerySchema>;

/** A published or done work as a profile or a portfolio shows it. */
export const publishedWorkView = z.object({
  referralId: uuid,
  workId: uuid,
  title: z.string(),
  ...place,
  stageCode: z.string(),
  contentType: z.enum(CONTENT_TYPES),
  summary: z.string().nullable(),
  publishedOn: z.string().nullable(),
  publications: z.array(
    z.object({
      platformCode: z.string(),
      link: z.string(),
      publishedOn: z.string().nullable(),
      youtubeId: z.string().nullable(),
    }),
  ),
  members: z.array(z.object({ userId: uuid, name: z.string(), roles: z.array(z.string()) })),
});
export type PublishedWork = z.infer<typeof publishedWorkView>;

/** A member of the Media Team as the team editor lists them. */
export const mediaMemberRow = z.object({
  id: uuid,
  name: z.string(),
  designation: z.string().nullable(),
  roles: z.array(z.string()),
});

export const mediaMemberView = z.object({
  id: uuid,
  name: z.string(),
  designation: z.string().nullable(),
  mobile: z.string().nullable(),
  email: z.string().nullable(),
  roles: z.array(z.string()),
  counts: z.object({ works: z.number().int(), published: z.number().int() }),
  portfolio: z.array(publishedWorkView.extend({ ownRoles: z.array(z.string()) })),
});

const STAGE_GROUPS = new Map<string, keyof Counts>([
  ['in_review', 'inReview'],
  ['shooting_preparation', 'waitingForShooting'],
  ['shooting_done', 'inEditing'],
  ['editing', 'inEditing'],
  ['ready_to_publish', 'published'],
  ['published', 'published'],
  ['done', 'done'],
]);
/** The group of a stage; a stage added in settings counts as in progress, hold and cancel as none. */
function groupOf(stage: string): keyof Counts | null {
  const group = STAGE_GROUPS.get(stage);
  if (group) return group;
  if (stage === 'on_hold' || stage === 'cancelled') return null;
  return isSystemStage(stage) && stage !== 'accepted' ? null : 'inProgress';
}

const empty = (): Counts => ({
  referrals: 0,
  new: 0,
  inReview: 0,
  inProgress: 0,
  waitingForShooting: 0,
  inEditing: 0,
  published: 0,
  done: 0,
  rejected: 0,
});

const name = (p: { nameBn: string; nameEn: string }): Bilingual => ({ bn: p.nameBn, en: p.nameEn });
const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

const PLACE_SELECT = {
  id: true,
  nameBn: true,
  nameEn: true,
  year: true,
  program: { select: { id: true, nameBn: true, nameEn: true } },
} satisfies Prisma.ProjectSelect;
type PlaceRow = Prisma.ProjectGetPayload<{ select: typeof PLACE_SELECT }>;
const placeOf = (p: PlaceRow) => ({
  program: { id: p.program.id, name: name(p.program) },
  project: { id: p.id, name: name(p), year: p.year },
});

const PUBLISHED_SELECT = {
  id: true,
  title: true,
  stageCode: true,
  contentType: true,
  script: true,
  referral: { select: { id: true, project: { select: PLACE_SELECT } } },
  members: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { userId: true, roles: true, user: { select: { displayName: true } } },
  },
  publications: {
    where: { state: 'published' },
    orderBy: [{ publishedOn: 'asc' }, { id: 'asc' }],
    select: { platformCode: true, link: true, publishedOn: true },
  },
} satisfies Prisma.MediaWorkSelect;
type PublishedRow = Prisma.MediaWorkGetPayload<{ select: typeof PUBLISHED_SELECT }>;

/** The stages after which a work shows on a profile and in a portfolio. */
const SHOWN_STAGES = ['published', 'done'];
/** The most recent works a profile or a portfolio shows. */
const SHOWN_MAX = 100;

function publishedView(w: PublishedRow): PublishedWork {
  const publications = w.publications.flatMap((p) =>
    p.link
      ? [
          {
            platformCode: p.platformCode,
            link: p.link,
            publishedOn: day(p.publishedOn),
            youtubeId: youtubeId(p.link),
          },
        ]
      : [],
  );
  return {
    referralId: w.referral.id,
    workId: w.id,
    title: w.title,
    ...placeOf(w.referral.project),
    stageCode: w.stageCode,
    contentType: w.contentType as PublishedWork['contentType'],
    // a stored script the schema no longer reads leaves the summary out, never the page
    summary: mediaScriptSchema.safeParse(w.script).data?.summary ?? null,
    publishedOn: publications[0]?.publishedOn ?? null,
    publications,
    members: w.members.map((m) => ({ userId: m.userId, name: m.user.displayName, roles: m.roles })),
  };
}

/**
 * The reads of the Media Team's screens (docs/plans/2026-10-26-1502-feat-media-team-plan.md,
 * screens): the home's counts by program, the works list, a member's profile with the portfolio,
 * and the published works of a person's profile. Each list is limited to the referrals the
 * caller's `media.work.view` reaches: a member sees only the works they are on.
 */
export class MediaHomeService {
  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async summary(scope: Scope): Promise<z.infer<typeof mediaSummaryView>> {
    const rows = await this.prisma.mediaReferral.findMany({
      where: mediaReferralWhere(scope),
      select: {
        state: true,
        project: { select: { program: { select: { id: true, nameBn: true, nameEn: true } } } },
        work: { select: { stageCode: true } },
      },
    });
    const overall = empty();
    const programs = new Map<
      string,
      { program: { id: string; name: Bilingual }; counts: Counts }
    >();
    for (const r of rows) {
      const p = r.project.program;
      const entry = programs.get(p.id) ?? { program: { id: p.id, name: name(p) }, counts: empty() };
      programs.set(p.id, entry);
      const groups: (keyof Counts)[] = ['referrals'];
      if (r.state === 'pending') groups.push('new');
      if (r.state === 'sent_back') groups.push('inReview');
      if (r.state === 'rejected') groups.push('rejected');
      const group = r.work ? groupOf(r.work.stageCode) : null;
      if (group) groups.push(group);
      for (const g of groups) {
        // eslint-disable-next-line security/detect-object-injection -- a typed group key
        overall[g] += 1;
        // eslint-disable-next-line security/detect-object-injection -- a typed group key
        entry.counts[g] += 1;
      }
    }
    return {
      overall,
      programs: [...programs.values()].sort((a, b) =>
        a.program.name.en.localeCompare(b.program.name.en),
      ),
    };
  }

  /** The works list, newest referral first, with its filters. */
  async list(principal: Principal, scope: Scope, query: MediaWorkQuery & PageQuery) {
    const lists = {
      stage: parseList(query.stage),
      priority: parseList(query.priority),
      state: parseList(query.state),
    };
    if (lists.priority.some((p) => !(MEDIA_PRIORITIES as readonly string[]).includes(p)))
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'priority', code: 'validation.option_unknown' },
      ]);
    if (lists.state.some((s) => !(REFERRAL_STATES as readonly string[]).includes(s)))
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'state', code: 'validation.option_unknown' },
      ]);
    const sort = parseSort(
      query.sort,
      ['createdAt', 'id'],
      [{ field: 'createdAt', direction: 'desc' }],
    );
    const binding = `media-works.list|${principal.userId}|${JSON.stringify([query.programId, lists, query.memberId])}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const filter: Prisma.MediaReferralWhereInput = {
      AND: [
        mediaReferralWhere(scope),
        ...(query.programId ? [{ project: { programId: query.programId } }] : []),
        ...(lists.stage.length ? [{ work: { stageCode: { in: lists.stage } } }] : []),
        ...(lists.priority.length ? [{ priority: { in: lists.priority } }] : []),
        ...(lists.state.length ? [{ state: { in: lists.state } }] : []),
        ...(query.memberId ? [{ work: { members: { some: { userId: query.memberId } } } }] : []),
      ],
    };
    const fetched = await this.prisma.mediaReferral.findMany({
      where: cursor ? { AND: [filter, keysetWhere(sort, cursor)] } : filter,
      orderBy: orderBy(sort, direction),
      take: query.limit + 1,
      select: {
        id: true,
        state: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
        beneficiary: { select: { name: true } },
        project: { select: PLACE_SELECT },
        work: {
          select: {
            id: true,
            title: true,
            stageCode: true,
            updatedAt: true,
            members: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: { userId: true, user: { select: { displayName: true } } },
            },
          },
        },
      },
    });
    const { rows, meta } = buildPage(fetched, {
      limit: query.limit,
      sort,
      direction,
      hadCursor: Boolean(cursor),
      secret: this.env.CURSOR_SECRET,
      binding,
    });
    return {
      rows: rows.map((r): WorkRow => ({
        referralId: r.id,
        workId: r.work?.id ?? null,
        title: r.work?.title ?? null,
        beneficiaryName: r.beneficiary.name,
        ...placeOf(r.project),
        members: (r.work?.members ?? []).map((m) => ({
          userId: m.userId,
          name: m.user.displayName,
        })),
        state: r.state as ReferralState,
        stageCode: r.work?.stageCode ?? null,
        priority: r.priority as WorkRow['priority'],
        referredAt: r.createdAt.toISOString(),
        updatedAt: (r.work && r.work.updatedAt > r.updatedAt
          ? r.work.updatedAt
          : r.updatedAt
        ).toISOString(),
      })),
      meta,
    };
  }

  /** The active members of the Media Team, by name: whom a director may put on a work. */
  async members(): Promise<z.infer<typeof mediaMemberRow>[]> {
    const users = await this.prisma.user.findMany({
      where: {
        kind: 'staff',
        state: 'active',
        userRolesUser: { some: { roleKey: { in: MEDIA_ROLES }, revokedAt: null } },
      },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
      take: 500,
      select: {
        id: true,
        displayName: true,
        designation: true,
        userRolesUser: {
          where: { roleKey: { in: MEDIA_ROLES }, revokedAt: null },
          select: { roleKey: true },
        },
      },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.displayName,
      designation: u.designation,
      roles: u.userRolesUser.map((r) => r.roleKey),
    }));
  }

  /**
   * A media member's profile: 404 unless the person holds a media role. Open to whoever reads media
   * works, since a portfolio of published works is public to the team and the referrers.
   */
  async member(principal: Principal, userId: string): Promise<z.infer<typeof mediaMemberView>> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        kind: 'staff',
        userRolesUser: { some: { roleKey: { in: MEDIA_ROLES }, revokedAt: null } },
      },
      select: {
        id: true,
        displayName: true,
        designation: true,
        mobile: true,
        email: true,
        userRolesUser: {
          where: { roleKey: { in: MEDIA_ROLES }, revokedAt: null },
          select: { roleKey: true },
        },
      },
    });
    if (!user) throw new ApiError('permission.not_found', 404);
    // the contact is for the team that works with the member; the portfolio is for everyone
    const team =
      principal.userId === userId ||
      holdsPermission(MANAGE_PERMISSION, (await this.access.load(principal.userId)).grants);
    const shownWhere = { stageCode: { in: SHOWN_STAGES }, members: { some: { userId } } };
    const [works, published, shown] = await Promise.all([
      this.prisma.mediaWorkMember.count({ where: { userId } }),
      this.prisma.mediaWork.count({ where: shownWhere }),
      this.prisma.mediaWork.findMany({
        where: shownWhere,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: SHOWN_MAX,
        select: PUBLISHED_SELECT,
      }),
    ]);
    return {
      id: user.id,
      name: user.displayName,
      designation: user.designation,
      mobile: team ? user.mobile : null,
      email: team ? user.email : null,
      roles: user.userRolesUser.map((r) => r.roleKey),
      counts: { works, published },
      portfolio: shown.map((w) => ({
        ...publishedView(w),
        ownRoles: w.members.find((m) => m.userId === userId)?.roles ?? [],
      })),
    };
  }
}

/** The published and done works about one person, for the 360° profile. */
export async function publishedWorksOf(
  db: Tx | PrismaService,
  beneficiaryId: string,
  projects?: Prisma.ProjectWhereInput,
): Promise<PublishedWork[]> {
  const works = await db.mediaWork.findMany({
    // only what went out: a work with a published link, of the projects the caller's rows reach
    where: {
      stageCode: { in: SHOWN_STAGES },
      publications: { some: { link: { not: null } } },
      referral: { beneficiaryId, ...(projects ? { project: projects } : {}) },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: SHOWN_MAX,
    select: PUBLISHED_SELECT,
  });
  return works.map(publishedView);
}
