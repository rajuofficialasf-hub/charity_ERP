import { EXPORT_RECORDS, type ExportRecord } from '@css/shared/exports';
import { z } from 'zod';
import { maskData } from '../access/field-mask.js';
import { beneficiaryWhere } from '../access/scope.js';
import type { AccessService } from '../access/service.js';
import type { ApplicationsService } from '../applications/service.js';
import { applicationView } from '../applications/view.js';
import type { Principal } from '../auth/principal.js';
import type { PrismaService } from '../core/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';
import { beneficiaryProfile } from '../routes/beneficiaries.js';
import type { BeneficiariesService } from '../services/beneficiaries.js';
import type { ApplicationForPdf } from './pdf/application.js';
import type { ProfileForPdf } from './pdf/profile.js';
import { classOf, IDENTITY_NUMBER, OFFICIAL_SECTION } from './questions.js';
import type { ExportRows } from './rows.js';

/** The permission that lets a record leave as a PDF, beside the record's own read. */
export const RECORD_PERMISSION: Readonly<Record<ExportRecord, string>> = {
  beneficiary_profile: 'report.beneficiary_journey',
  application: 'export.list',
};

/**
 * A record's PDF as the request froze it: the record as the person could read and export it at
 * that moment (the route's response, masked with the export's classes and trimmed to what the
 * PDF prints), and the protected classes it holds. The job prints the view and then clears it,
 * keeping the classes for the download's check.
 */
export interface FrozenRecord {
  kind: ExportRecord;
  recordId: string;
  view: ProfileForPdf | ApplicationForPdf | null;
  classes: string[];
  locale: 'bn' | 'en';
}

const frozenRecordSchema = z.object({
  record: z.object({
    kind: z.enum(EXPORT_RECORDS),
    recordId: z.string(),
    view: z.record(z.string(), z.unknown()).nullable(),
    classes: z.array(z.string()),
    locale: z.enum(['bn', 'en']),
  }),
});

/** A record job's frozen record as stored, or null when the row does not hold one. */
export function readFrozenRecord(stored: unknown): FrozenRecord | null {
  const parsed = frozenRecordSchema.safeParse(stored);
  return parsed.success ? (parsed.data.record as FrozenRecord) : null;
}

/** The record read through the route's own response schema, then masked with the given classes. */
function masked<T>(schema: z.ZodType, value: unknown, classes: readonly string[]): T {
  return maskData(schema, schema.parse(JSON.parse(JSON.stringify(value))), new Set(classes)) as T;
}

/**
 * The records printed whole as PDFs (the export service decision in docs/DECISION_LOG.md): the
 * beneficiary's 360° profile and one application, each read through the same service and response
 * schema as its page, with the protected fields the export may carry for that record.
 */
export class ExportRecords {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly rows: ExportRows,
    private readonly beneficiaries: BeneficiariesService,
    private readonly applications: ApplicationsService,
  ) {}

  /** Reads and masks the record now; 404 for one the person may not read, 403 without the permission. */
  async snapshot(
    principal: Principal,
    kind: ExportRecord,
    recordId: string,
    locale: 'bn' | 'en',
  ): Promise<FrozenRecord> {
    return kind === 'beneficiary_profile'
      ? this.profile(principal, recordId, locale)
      : this.application(principal, recordId, locale);
  }

  private async profile(
    principal: Principal,
    id: string,
    locale: 'bn' | 'en',
  ): Promise<FrozenRecord> {
    const list = await this.rows.freeze(
      principal,
      { kind: 'beneficiaries', filters: {} },
      locale,
      RECORD_PERMISSION.beneficiary_profile,
    );
    const access = await this.access.load(principal.userId);
    // the journey report reaches only the profiles of its own scope
    const journey = await this.access.scopeFor(
      principal,
      access,
      RECORD_PERMISSION.beneficiary_profile,
      'beneficiary',
    );
    const reached = await this.prisma.beneficiary.count({
      where: { AND: [{ id }, beneficiaryWhere(journey) as Prisma.BeneficiaryWhereInput] },
    });
    if (reached === 0) {
      this.access.denied(principal.userId, RECORD_PERMISSION.beneficiary_profile, 'beneficiary');
      throw new ApiError('permission.not_found', 404);
    }
    const scope = await this.access.scopeFor(
      principal,
      access,
      'beneficiary.view_all',
      'beneficiary',
    );
    const read = await this.beneficiaries.profile(
      { principal, scope, fieldClasses: access.fieldClasses },
      id,
    );
    const allowed = await this.rows.classesOf(list, id);
    const p = masked<ProfileForPdf & Record<string, unknown>>(beneficiaryProfile, read, allowed);
    const view: ProfileForPdf = {
      benNo: p.benNo,
      name: p.name,
      fatherOrHusbandName: p.fatherOrHusbandName,
      motherName: p.motherName,
      genderCode: p.genderCode,
      ageYears: p.ageYears,
      classCode: p.classCode,
      status: p.status,
      divisionId: p.divisionId,
      districtId: p.districtId,
      upazilaId: p.upazilaId,
      unionId: p.unionId,
      village: p.village,
      postOffice: p.postOffice,
      postCode: p.postCode,
      mobile: p.mobile,
      nid: p.nid,
      birthReg: p.birthReg,
      familyMembers: p.familyMembers,
      projectsByYear: p.projectsByYear,
      applications: p.applications,
    };
    // the identity numbers stay only where the export reaches them; either one makes it sensitive
    const holdsNid = (view.nid ?? null) !== null || (view.birthReg ?? null) !== null;
    return {
      kind: 'beneficiary_profile',
      recordId: id,
      view,
      classes: holdsNid ? [IDENTITY_NUMBER] : [],
      locale,
    };
  }

  private async application(
    principal: Principal,
    id: string,
    locale: 'bn' | 'en',
  ): Promise<FrozenRecord> {
    const found = await this.prisma.application.findUnique({
      where: { id },
      select: { projectId: true },
    });
    if (!found) throw new ApiError('permission.not_found', 404);
    // an application the person may not read answers as a missing one, so its id tells nothing
    const list = await this.rows
      .freeze(
        principal,
        { kind: 'applications', filters: {}, projectId: found.projectId },
        locale,
        RECORD_PERMISSION.application,
      )
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 403)
          throw new ApiError('permission.not_found', 404);
        throw error;
      });
    const access = await this.access.load(principal.userId);
    const scope = await this.access.scopeFor(principal, access, 'application.view', 'application');
    const read = await this.applications.get(
      { principal, scope, fieldClasses: access.fieldClasses },
      id,
    );
    const allowed = new Set(await this.rows.classesOf(list, id));
    const a = masked<ApplicationForPdf>(applicationView, read.application, [...allowed]);
    // the sections and answers of a class the export does not carry for this record are dropped
    // here, so the job's row never holds them
    const kept = new Set<string>();
    const sections = a.form.sections
      .map((section) => ({
        ...section,
        fields: section.fields.filter((field) => {
          const cls = classOf(section.visibility, field.standardColumn);
          if (cls && !allowed.has(cls)) return false;
          kept.add(field.fieldKey);
          return true;
        }),
      }))
      .filter((section) => section.fields.length > 0);
    const answers = a.answers.filter((answer) => kept.has(answer.fieldKey));
    const answered = new Set(answers.map((answer) => answer.fieldKey));
    const classes = new Set<string>();
    for (const section of sections)
      for (const field of section.fields) {
        const cls = classOf(section.visibility, field.standardColumn);
        if (cls && answered.has(field.fieldKey)) classes.add(cls);
      }
    if (a.totalScore !== undefined || a.decisionComment !== undefined)
      if (allowed.has(OFFICIAL_SECTION)) classes.add(OFFICIAL_SECTION);
    const view: ApplicationForPdf = {
      appNo: a.appNo,
      projectId: a.projectId,
      status: a.status,
      stage: a.stage,
      outcome: a.outcome,
      submittedAt: a.submittedAt,
      reviewedAt: a.reviewedAt,
      approvedAt: a.approvedAt,
      ...(a.totalScore !== undefined ? { totalScore: a.totalScore } : {}),
      ...(a.decisionComment !== undefined ? { decisionComment: a.decisionComment } : {}),
      answers,
      form: { sections },
    };
    return { kind: 'application', recordId: id, view, classes: [...classes].sort(), locale };
  }
}
