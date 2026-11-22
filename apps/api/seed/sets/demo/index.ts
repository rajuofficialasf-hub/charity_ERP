import {
  componentSettingsSchema,
  demoName,
  fakeBirthReg,
  fakeEmail,
  fakeMobile,
  fakeNid,
} from '@css/shared';
import { type FormField, publishDefinitionSchema } from '@css/shared/forms';
import { hash } from '@node-rs/argon2';
import { json, SEED_AT, type SeedContext, seedId } from '../../context.js';
import { readWorkflowTemplates, workflowVersionOf } from '../base/workflows.js';
import { writeDefinitionRows } from '../../../src/services/forms.js';
import { writeHelpCounts } from '../../../src/services/help-history.js';
import { MatchKeysService, profileKeysWith } from '../../../src/services/match-keys.js';

/**
 * Demo set: one account per official role, 21 volunteers, 50 beneficiaries in two divisions (one of
 * them blocked) and one draft winter project. Every identity is obviously fake
 * (docs/testing/TEST_STRATEGY.md, "Test data strategy"); the shared password is listed in
 * docs/testing/DEMO_ACCOUNTS.md (development only). Later tasks extend this set as their entities
 * become functional.
 */
export const DEMO_PASSWORD = 'CssDemo2026';
const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 } as const; // Argon2id, as the API hashes

export interface DemoStaff {
  key: string;
  role: string;
  name: string;
  email: string;
  mobileIndex: number;
  designation: string;
  /** The organisation's job ID, the login id of an official. */
  jobId: string;
  /** The key of the official this one reports to (the organogram); listed before this one. */
  supervisor?: string;
}

export const DEMO_PROGRAMS = [
  {
    code: 'UCD',
    name_bn: 'আন্ডারপ্রিভিলেজড কমিউনিটি ডেভেলপমেন্ট প্রোগ্রাম',
    name_en: 'Underprivileged Community Development Program',
    pm: 'pm_ucd',
  },
  {
    code: 'HUM',
    name_bn: 'হিউম্যানিটেরিয়ান প্রোগ্রাম',
    name_en: 'Humanitarian Program',
    pm: 'pm_hum',
  },
  {
    code: 'ERR',
    name_bn: 'ইমার্জেন্সি রেসপন্স অ্যান্ড রিহ্যাবিলিটেশন প্রোগ্রাম',
    name_en: 'Emergency Response and Rehabilitation Program',
    pm: 'pm_err',
  },
];

export const DEMO_STAFF: DemoStaff[] = [
  {
    key: 'admin',
    role: 'admin',
    name: 'অ্যাডমিন',
    email: 'admin',
    mobileIndex: 17,
    designation: 'সিস্টেম অ্যাডমিন',
    jobId: 'CSS-000',
  },
  {
    key: 'department_head',
    role: 'department_head',
    name: 'ডিপার্টমেন্ট হেড',
    email: 'head',
    mobileIndex: 1,
    designation: 'ডিপার্টমেন্ট হেড',
    jobId: 'CSS-001',
  },
  {
    key: 'monitoring',
    role: 'monitoring_team',
    name: 'মনিটরিং কর্মকর্তা',
    email: 'monitoring',
    mobileIndex: 2,
    designation: 'মনিটরিং টিম',
    jobId: 'CSS-002',
    supervisor: 'department_head',
  },
  {
    key: 'pm_ucd',
    role: 'program_manager',
    name: 'প্রোগ্রাম ম্যানেজার (স্বাবলম্বী)',
    email: 'pm.ucd',
    mobileIndex: 3,
    designation: 'প্রোগ্রাম ম্যানেজার',
    jobId: 'CSS-101',
    supervisor: 'department_head',
  },
  {
    key: 'pm_hum',
    role: 'program_manager',
    name: 'প্রোগ্রাম ম্যানেজার (মানবিক)',
    email: 'pm.hum',
    mobileIndex: 4,
    designation: 'প্রোগ্রাম ম্যানেজার',
    jobId: 'CSS-102',
    supervisor: 'department_head',
  },
  {
    key: 'pm_err',
    role: 'program_manager',
    name: 'প্রোগ্রাম ম্যানেজার (জরুরি সাড়া)',
    email: 'pm.err',
    mobileIndex: 5,
    designation: 'প্রোগ্রাম ম্যানেজার',
    jobId: 'CSS-103',
    supervisor: 'department_head',
  },
  {
    key: 'rpm_dhaka',
    role: 'regional_program_manager',
    name: 'আরপিএম ঢাকা',
    email: 'rpm.dhaka',
    mobileIndex: 6,
    designation: 'রিজিওনাল প্রোগ্রাম ম্যানেজার',
    jobId: 'CSS-201',
    supervisor: 'pm_hum',
  },
  {
    key: 'rpm_rangpur',
    role: 'regional_program_manager',
    name: 'আরপিএম রংপুর',
    email: 'rpm.rangpur',
    mobileIndex: 7,
    designation: 'রিজিওনাল প্রোগ্রাম ম্যানেজার',
    jobId: 'CSS-202',
    supervisor: 'pm_ucd',
  },
  {
    // the official of the handover journey: holds one project area, deactivated in E2E
    key: 'rpm_handover',
    role: 'regional_program_manager',
    name: 'আরপিএম হ্যান্ডওভার',
    email: 'handover.rpm',
    mobileIndex: 14,
    designation: 'রিজিওনাল প্রোগ্রাম ম্যানেজার',
    jobId: 'CSS-203',
    supervisor: 'pm_err',
  },
  {
    key: 'executive',
    role: 'project_executive',
    name: 'প্রজেক্ট এক্সিকিউটিভ',
    email: 'executive',
    mobileIndex: 8,
    designation: 'প্রজেক্ট এক্সিকিউটিভ',
    jobId: 'CSS-301',
    supervisor: 'rpm_dhaka',
  },
  {
    key: 'official_daee',
    role: 'official_daee',
    name: 'অফিসিয়াল দায়ী',
    email: 'daee',
    mobileIndex: 9,
    designation: 'অফিশিয়াল দায়ী',
    jobId: 'CSS-302',
    supervisor: 'rpm_dhaka',
  },
  {
    key: 'procurement',
    role: 'procurement_team',
    name: 'প্রকিউরমেন্ট কর্মকর্তা',
    email: 'procurement',
    mobileIndex: 11,
    designation: 'প্রকিউরমেন্ট টিম',
    jobId: 'CSS-401',
    supervisor: 'department_head',
  },
  {
    key: 'media_director',
    role: 'media_director',
    name: 'মিডিয়া ডিরেক্টর (নমুনা)',
    email: 'media.director',
    mobileIndex: 15,
    designation: 'মিডিয়া ডিরেক্টর',
    jobId: 'CSS-404',
    supervisor: 'department_head',
  },
  {
    key: 'media_ad',
    role: 'media_assistant_director',
    name: 'মিডিয়া অ্যাসিস্ট্যান্ট ডিরেক্টর (নমুনা)',
    email: 'media.ad',
    mobileIndex: 16,
    designation: 'মিডিয়া সহকারী ডিরেক্টর',
    jobId: 'CSS-405',
    supervisor: 'media_director',
  },
  {
    key: 'media',
    role: 'media_team',
    name: 'মিডিয়া কর্মকর্তা',
    email: 'media',
    mobileIndex: 12,
    designation: 'মিডিয়া টিম',
    jobId: 'CSS-402',
    supervisor: 'media_ad',
  },
  {
    key: 'finance',
    role: 'finance_team',
    name: 'ফাইন্যান্স কর্মকর্তা',
    email: 'finance',
    mobileIndex: 13,
    designation: 'ফাইন্যান্স টিম',
    jobId: 'CSS-403',
    supervisor: 'department_head',
  },
];

type VolunteerType = 'general' | 'local_daee' | 'both' | 'team_member' | 'paid';
const VOLUNTEER_ROLE: Record<VolunteerType, string> = {
  general: 'volunteer_general',
  local_daee: 'volunteer_local_daee',
  both: 'volunteer_both',
  team_member: 'volunteer_team_member',
  paid: 'volunteer_paid',
};
const SPECIAL_VOLUNTEERS = ['both', 'local_daee', 'team_member', 'paid'] as const;
/**
 * 21 volunteers: 16 general, then one each of both, local দায়ী, team member and paid, and a last
 * general one (Dhaka) kept for the offline journeys alone, which sign out all its devices.
 */
export const DEMO_VOLUNTEERS: { n: number; type: VolunteerType }[] = Array.from(
  { length: 21 },
  (_, i) => ({
    n: i + 1,
    type: SPECIAL_VOLUNTEERS[i - 16] ?? 'general',
  }),
);

/** The demo beneficiary (number n of `beneficiary:n`, Dhaka division) that stands on the blocklist. */
const DEMO_BLOCKED_BENEFICIARY = 3;

/**
 * The demo person helped once (number n of `beneficiary:n`, after the duplicate pairs): an
 * application of the closed 2025 session of WNT, approved before the close, so the profile shows the
 * times helped (docs/testing/DEMO_ACCOUNTS.md).
 */
export const DEMO_HELPED_BENEFICIARY = {
  n: 55,
  nid: '1000001054',
  name: 'সালেহা বেগম',
  father: 'মৃত আবুল কাশেম',
  mobile: 1054,
} as const;

/**
 * Two suggested duplicate pairs after the 50 beneficiaries (numbers n of `beneficiary:n`): each
 * pair has the same name, father's or husband's name, mobile and village, and both people applied to
 * project WNT, so the PM of program HUM reaches them. The merge journey uses one pair per
 * Playwright project, since the projects share the database.
 */
export const DEMO_DUPLICATE_PAIRS = [
  {
    n: [51, 52],
    nids: ['1000001050', '1000001051'],
    name: 'রাবেয়া খাতুন',
    father: 'আব্দুল মজিদ',
    mobile: 1050,
  },
  {
    n: [53, 54],
    nids: ['1000001052', '1000001053'],
    name: 'আনোয়ারা বেগম',
    father: 'মো. হারুন',
    mobile: 1051,
  },
] as const;

const FEMALE = [
  'রহিমা খাতুন',
  'আমেনা বেগম',
  'ফাতেমা আক্তার',
  'জাহানারা বেগম',
  'সালমা খাতুন',
  'রাশিদা বেগম',
  'কুলসুম বিবি',
  'মর্জিনা বেগম',
  'হাসিনা আক্তার',
  'নূরজাহান বেগম',
];
const MALE = [
  'আব্দুল করিম',
  'মো. রহমান',
  'আবুল কাশেম',
  'জমির উদ্দিন',
  'হাবিবুর রহমান',
  'নুরুল ইসলাম',
  'আব্দুস সালাম',
  'মোস্তফা কামাল',
  'শাহ আলম',
  'সিরাজুল ইসলাম',
];
const FATHERS = ['আব্দুল জব্বার', 'মো. ইউসুফ', 'আলী আকবর', 'কাশেম আলী', 'আব্দুর রশিদ'];

interface UnionRef {
  division: string;
  district: string;
  upazila: string;
  union: string;
}

async function unionsOf(ctx: SeedContext, divisionEn: string, count: number): Promise<UnionRef[]> {
  const unions = await ctx.db.$queryRaw<UnionRef[]>`
    SELECT dv.id AS division, d.id AS district, up.id AS upazila, u.id AS "union"
    FROM locations u
    JOIN locations up ON up.id = u.parent_id
    JOIN locations d ON d.id = up.parent_id
    JOIN locations dv ON dv.id = d.parent_id
    WHERE dv.level = 'division' AND dv.name_en = ${divisionEn} AND u.kind = 'union' AND u.active
    ORDER BY u.code LIMIT ${count}::int`;
  if (unions.length < count)
    throw new Error(`demo seed needs ${count} unions in ${divisionEn}; run the base set first`);
  return unions;
}

export async function seedDemo(ctx: SeedContext): Promise<void> {
  await ctx.transaction(async () => {
    const passwordHash = await hash(DEMO_PASSWORD, ARGON2);
    const userId = (key: string) => seedId(`user:${key}`);
    const dhaka = await unionsOf(ctx, 'Dhaka', 25);
    const rangpur = await unionsOf(ctx, 'Rangpur', 25);
    // the name keys of a profile, as the API stores them with every name it writes
    const variants = await new MatchKeysService().list(ctx.db);
    const nameKeys = (name: string, fatherOrHusbandName: string, village: string) => {
      const k = profileKeysWith(variants, { name, fatherOrHusbandName, village });
      return {
        name_key: k.nameKey,
        guardian_key: k.guardianKey,
        village_key: k.villageKey,
        match_keys_version: k.matchKeysVersion,
      };
    };
    const divisionIdOf = (key: string) =>
      key === 'rpm_rangpur' ? rangpur[0]!.division : dhaka[0]!.division;

    // staff accounts and their roles; a PM's home program is filled in once the program exists
    const homeProgram = (s: DemoStaff) =>
      s.key.startsWith('pm_') ? seedId(`program:${s.key.slice(3).toUpperCase()}`) : null;
    /** Whether the demo Admin is made the Main Admin by this run (decided below, before the rows are written). */
    let adminOwns = false;
    const staffRow = (s: DemoStaff, withProgram: boolean) => ({
      id: userId(s.key),
      kind: 'staff',
      email: fakeEmail(s.email),
      mobile: fakeMobile(s.mobileIndex),
      password_hash: passwordHash,
      state: 'active',
      // written when the row is made, never after: the flag moves by the owner transfer alone
      is_system_owner: s.key === 'admin' && adminOwns,
      display_name: demoName(s.name),
      designation: s.designation,
      job_id: s.jobId,
      affiliation: 'department',
      supervisor_user_id: s.supervisor ? userId(s.supervisor) : null,
      home_division_id: s.role === 'regional_program_manager' ? divisionIdOf(s.key) : null,
      ...(withProgram ? { home_program_id: homeProgram(s) } : {}),
      language: 'bn',
      ...ctx.audit(),
    });
    // The Main Admin is the demo Admin. A database seeded before the Admin role has the demo Head
    // as the Main Admin, holding the admin role alone since the admin role migration: the first
    // seed that makes the demo Admin hands the flag over and gives the Head the Head's role back.
    // Any other state is the owner's own doing and stays: later seeds touch neither the flag nor
    // a role, and the demo Admin is made the Main Admin only where the database has none.
    const headId = userId('department_head');
    const adminIsNew = (await ctx.db.user.count({ where: { id: userId('admin') } })) === 0;
    const headRoles = adminIsNew
      ? await ctx.db.userRole.findMany({
          where: { userId: headId, revokedAt: null },
          select: { roleKey: true },
        })
      : [];
    const handsOver =
      adminIsNew &&
      headRoles.length === 1 &&
      headRoles[0]!.roleKey === 'admin' &&
      (await ctx.db.user.count({ where: { id: headId, isSystemOwner: true } })) === 1;
    if (handsOver)
      await ctx.db.user.update({
        where: { id: headId },
        data: { isSystemOwner: false, permissionVersion: { increment: 1 } },
      });
    adminOwns = adminIsNew && (await ctx.db.user.count({ where: { isSystemOwner: true } })) === 0;
    for (const s of DEMO_STAFF) {
      await ctx.upsert('users', s.key.startsWith('pm_') ? staffRow(s, false) : staffRow(s, true), {
        insertOnly: ['password_hash', 'is_system_owner'],
      });
    }
    // programs need their PM; the PM's home program is set after the program exists
    for (const p of DEMO_PROGRAMS) {
      await ctx.upsert('programs', {
        id: seedId(`program:${p.code}`),
        code: p.code,
        name_bn: p.name_bn,
        name_en: p.name_en,
        pm_user_id: userId(p.pm),
        active: true,
        ...ctx.audit(),
      });
    }
    for (const s of DEMO_STAFF.filter((x) => x.key.startsWith('pm_'))) {
      await ctx.upsert('users', staffRow(s, true), {
        insertOnly: ['password_hash', 'is_system_owner'],
      });
    }
    const grant = (user: string, role: string) =>
      ctx.upsert('user_roles', {
        id: seedId(`user-role:${user}:${role}`),
        user_id: user,
        role_key: role,
        granted_by: ctx.actorId,
        granted_at: SEED_AT,
      });
    for (const s of DEMO_STAFF) await grant(userId(s.key), s.role);
    if (handsOver) {
      await ctx.db.userRole.updateMany({
        where: { userId: headId, roleKey: 'admin', revokedAt: null },
        data: { revokedAt: SEED_AT, revokedBy: ctx.actorId },
      });
      await ctx.db.userRole.updateMany({
        where: { id: seedId(`user-role:${headId}:department_head`) },
        data: { revokedAt: null, revokedBy: null },
      });
    }

    // volunteers (the team member refers to volunteer 1 by NID)
    const mainVolunteer = { id: seedId('volunteer:1'), nid: fakeNid(1) };
    for (const v of DEMO_VOLUNTEERS) {
      const home = (v.n % 2 === 1 ? dhaka : rangpur)[v.n]!;
      const uid = userId(`volunteer_${v.n}`);
      await ctx.upsert(
        'users',
        {
          id: uid,
          kind: 'volunteer',
          mobile: fakeMobile(100 + v.n),
          password_hash: passwordHash,
          state: 'active',
          display_name: demoName(`স্বেচ্ছাসেবক ${v.n}`),
          language: 'bn',
          ...ctx.audit(),
        },
        { insertOnly: ['password_hash'] },
      );
      await grant(uid, VOLUNTEER_ROLE[v.type]);
      await ctx.upsert('volunteers', {
        id: seedId(`volunteer:${v.n}`),
        user_id: uid,
        nid: fakeNid(v.n),
        type: v.type,
        father_name: demoName('পিতার নাম'),
        mother_name: demoName('মাতার নাম'),
        division_id: home.division,
        district_id: home.district,
        upazila_id: home.upazila,
        union_id: home.union,
        reference_nid: v.type === 'team_member' ? mainVolunteer.nid : null,
        reference_volunteer_id: v.type === 'team_member' ? mainVolunteer.id : null,
        approved_by: userId('executive'),
        approved_at: SEED_AT,
        ...ctx.audit(),
      });
    }

    // 50 beneficiaries, 25 per division; five identified by birth registration only
    for (let i = 0; i < 50; i++) {
      const place = (i < 25 ? dhaka : rangpur)[i % 25]!;
      const female = i % 2 === 0;
      const byBirthReg = i % 10 === 9;
      const name = demoName((female ? FEMALE : MALE)[i % 10]!);
      const father = demoName(FATHERS[i % 5]!);
      const village = `নমুনা গ্রাম ${(i % 12) + 1}`;
      await ctx.upsert('beneficiaries', {
        id: seedId(`beneficiary:${i + 1}`),
        nid: byBirthReg ? null : fakeNid(1000 + i),
        birth_reg: byBirthReg ? fakeBirthReg(i + 1) : null,
        name,
        father_or_husband_name: father,
        mobile: fakeMobile(1000 + i),
        gender_code: female ? 'female' : 'male',
        age_years: 25 + ((i * 7) % 50),
        marital_status_code: ['married', 'widowed', 'never_married', 'divorced'][i % 4],
        education_code: ['illiterate', 'primary', 'secondary'][i % 3],
        division_id: place.division,
        district_id: place.district,
        upazila_id: place.upazila,
        union_id: place.union,
        village,
        ...nameKeys(name, father, village),
        members_14_plus: 1 + (i % 4),
        children_under_14: i % 3,
        daily_income: String(200 + (i % 6) * 50),
        ...ctx.audit(),
      });
    }
    // one blocked person in the Dhaka division, for the lookup's "blocked" answer
    await ctx.upsert('blocklist', {
      id: seedId(`blocklist:beneficiary:${DEMO_BLOCKED_BENEFICIARY}`),
      subject_type: 'beneficiary',
      subject_id: seedId(`beneficiary:${DEMO_BLOCKED_BENEFICIARY}`),
      reason: demoName('একই মানুষ দুটি নম্বরে আবেদন করেছেন'),
      blocked_by: userId('rpm_dhaka'),
      blocked_at: SEED_AT,
      active: true,
      ...ctx.audit(),
    });

    // one draft winter project (distribution workflow) with its components
    // the project it is the 2026 session of, with the same code and names
    // a database seeded before the series existed got the project's own series from their
    // migration (the series id is the project's), so the one with this code is taken as it is
    const seriesId =
      (await ctx.db.projectSeries.findUnique({ where: { code: 'WNT' }, select: { id: true } }))
        ?.id ?? seedId('project-series:WNT');
    await ctx.upsert('project_series', {
      id: seriesId,
      program_id: seedId('program:HUM'),
      code: 'WNT',
      name_bn: 'শীতবস্ত্র বিতরণ 2026',
      name_en: 'Winter Clothing 2026',
      ...ctx.audit(),
    });
    const projectId = seedId('project:WNT:2026');
    await ctx.upsert('projects', {
      id: projectId,
      program_id: seedId('program:HUM'),
      series_id: seriesId,
      code: 'WNT',
      year: 2026,
      period_from: '2026-01-01',
      period_to: '2026-12-31',
      name_bn: 'শীতবস্ত্র বিতরণ 2026',
      name_en: 'Winter Clothing 2026',
      description: demoName('খসড়া প্রকল্প, ডেমো ডেটা'),
      status: 'draft',
      workflow_definition_id: seedId(`workflow:distribution:${workflowVersionOf('distribution')}`),
      workflow_version: workflowVersionOf('distribution'),
      per_volunteer_limit: 50,
      cost_per_beneficiary: '1500.00',
      target_beneficiaries: 2000,
      ...ctx.audit(),
    });
    await ctx.upsert(
      'id_sequences',
      { scope_key: `app:${projectId}`, last_value: 0 },
      { key: ['scope_key'], insertOnly: ['last_value'] },
    );
    for (const [rpm, location] of [
      ['rpm_dhaka', dhaka[0]!.division],
      ['rpm_rangpur', rangpur[0]!.division],
      // a district of its own, so the handover to the Dhaka RPM moves it without a clash
      ['rpm_handover', dhaka[0]!.district],
    ] as const) {
      await ctx.upsert('project_areas', {
        id: seedId(`project-area:WNT:${rpm}`),
        project_id: projectId,
        location_id: location,
        rpm_user_id: userId(rpm),
        ...ctx.audit(),
      });
    }
    const label = (bn: string, en: string) => ({ bn, en });
    const components: Record<string, unknown> = {
      application_form: {},
      volunteer_assignment: { team_members_allowed: true },
      dispatch_receive: {},
      distribution: {
        rule: 'individual',
        source: { distribution_proof: 'camera_only' },
        dedup_identical: true,
      },
      volunteer_expenses: {
        categories: [
          { code: 'decoration', label: label('সাজসজ্জা', 'Decoration') },
          { code: 'vehicle_hire', label: label('গাড়ি ভাড়া', 'Vehicle hire') },
          { code: 'food', label: label('খাবার', 'Food') },
          { code: 'photocopy', label: label('ফটোকপি', 'Photocopy') },
          { code: 'banner', label: label('ব্যানার', 'Banner') },
        ],
      },
      rating_criteria: {
        criteria: [
          { code: 'timeliness', label: label('সময়মতো কাজ', 'Timeliness') },
          { code: 'data_quality', label: label('তথ্যের মান', 'Data quality') },
          { code: 'conduct', label: label('আচরণ', 'Conduct') },
        ],
      },
    };
    // a project at work beside the draft: only the areas of an active or a closing project show
    // the people who hold them the volunteers living there, so the two RPMs, the Executive and the
    // Official দায়ী meet the volunteers of their divisions in the demo
    const activeSeriesId = seedId('project-series:IFT');
    await ctx.upsert('project_series', {
      id: activeSeriesId,
      program_id: seedId('program:HUM'),
      code: 'IFT',
      name_bn: 'ইফতার বিতরণ',
      name_en: 'Iftar Distribution',
      ...ctx.audit(),
    });
    const activeId = seedId('project:IFT:2026');
    const distribution = readWorkflowTemplates().find((t) => t.template === 'distribution');
    await ctx.upsert('projects', {
      id: activeId,
      program_id: seedId('program:HUM'),
      series_id: activeSeriesId,
      code: 'IFT',
      year: 2026,
      period_from: '2026-01-01',
      period_to: '2026-12-31',
      name_bn: 'ইফতার বিতরণ 2026',
      name_en: 'Iftar Distribution 2026',
      description: demoName('চালু প্রকল্প, ডেমো ডেটা'),
      status: 'active',
      activated_at: SEED_AT,
      workflow_definition_id: seedId(`workflow:distribution:${workflowVersionOf('distribution')}`),
      workflow_version: workflowVersionOf('distribution'),
      // an active project runs on the definition it was activated with
      workflow_snapshot: json(distribution),
      per_volunteer_limit: 50,
      cost_per_beneficiary: '900.00',
      target_beneficiaries: 1000,
      ...ctx.audit(),
    });
    await ctx.upsert(
      'id_sequences',
      { scope_key: `app:${activeId}`, last_value: 0 },
      { key: ['scope_key'], insertOnly: ['last_value'] },
    );
    for (const [rpm, location] of [
      ['rpm_dhaka', dhaka[0]!.division],
      ['rpm_rangpur', rangpur[0]!.division],
    ] as const) {
      await ctx.upsert('project_areas', {
        id: seedId(`project-area:IFT:${rpm}`),
        project_id: activeId,
        location_id: location,
        rpm_user_id: userId(rpm),
        ...ctx.audit(),
      });
    }
    // the field officials under the Dhaka RPM, each with the whole division
    for (const [key, role] of [
      ['executive', 'project_executive'],
      ['official_daee', 'official_daee'],
    ] as const) {
      await ctx.upsert(
        'project_staff',
        {
          id: seedId(`project-staff:IFT:${key}`),
          project_id: activeId,
          user_id: userId(key),
          role_key: role,
          area_location_id: dhaka[0]!.division,
          can_view: true,
          can_edit: true,
          can_delete: false,
          granted_by: userId('rpm_dhaka'),
          ...ctx.audit(),
        },
        // a handover or an end of the place in a dev database stays as the person left it
        { insertOnly: ['user_id', 'area_location_id', 'can_view', 'can_edit', 'can_delete'] },
      );
    }
    for (const [code, id] of [
      ['WNT', projectId],
      ['IFT', activeId],
    ] as const) {
      for (const [key, settings] of Object.entries(components)) {
        componentSettingsSchema(key).parse(settings);
        await ctx.upsert('project_components', {
          id: seedId(`project-component:${code}:${key}`),
          project_id: id,
          component_key: key,
          enabled: true,
          settings: json(settings),
          ...ctx.audit(),
        });
      }
    }

    // the duplicate pairs: a draft form version of WNT for their applications, the four
    // profiles, one application each (under review, so a merge leaves the retired one's in place),
    // and the pair as the duplicate search keeps it
    // its own key, so a form a person makes in WNT on a dev database (the app's usual first key is
    // default) never collides with the seed's
    const formId = seedId('form:WNT:default');
    await ctx.upsert('forms', {
      id: formId,
      project_id: projectId,
      key: 'duplicate_pairs',
      title_bn: 'আবেদন ফর্ম',
      title_en: 'Application form',
      ...ctx.audit(),
    });
    const formVersionId = seedId('form-version:WNT:default:1');
    await ctx.upsert('form_versions', {
      id: formVersionId,
      form_id: formId,
      version_no: 1,
      ...ctx.audit(),
    });
    const place = dhaka[0]!;
    for (const pair of DEMO_DUPLICATE_PAIRS) {
      for (const [i, n] of pair.n.entries()) {
        const beneficiaryId = seedId(`beneficiary:${n}`);
        await ctx.upsert('beneficiaries', {
          id: beneficiaryId,
          nid: pair.nids[i],
          birth_reg: null,
          name: demoName(pair.name),
          father_or_husband_name: demoName(pair.father),
          ...nameKeys(demoName(pair.name), demoName(pair.father), 'নমুনা গ্রাম 3'),
          mobile: fakeMobile(pair.mobile),
          gender_code: 'female',
          age_years: 40 + i,
          marital_status_code: 'married',
          education_code: 'primary',
          division_id: place.division,
          district_id: place.district,
          upazila_id: place.upazila,
          union_id: place.union,
          village: 'নমুনা গ্রাম 3',
          members_14_plus: 2,
          children_under_14: 1,
          daily_income: '300',
          ...ctx.audit(),
        });
        // a merge or its revert moves rows; a later seed run leaves them where they are
        await ctx.upsert(
          'applications',
          {
            id: seedId(`application:WNT:${n}`),
            project_id: projectId,
            form_version_id: formVersionId,
            beneficiary_id: beneficiaryId,
            status: 'under_review',
            region_location_id: place.division,
            district_id: place.district,
            union_id: place.union,
            submitted_at: SEED_AT,
            ...ctx.audit(),
          },
          { insertOnly: ['beneficiary_id', 'status'] },
        );
      }
      const [low, high] = pair.n.map((n) => seedId(`beneficiary:${n}`)).sort();
      await ctx.upsert(
        'beneficiary_merge_candidates',
        {
          low_id: low,
          high_id: high,
          // the same name, father's or husband's name, mobile and village: every rule but the birth date
          rules: ['name_father_mobile', 'name_father_village', 'same_mobile'],
          level: 'probable',
          active: true,
          computed_at: SEED_AT,
        },
        { key: ['low_id', 'high_id'], insertOnly: ['rules', 'level', 'active', 'computed_at'] },
      );
    }

    // one person helped once: the 2025 session of the same series, closed, with the application
    // approved before its close, so the profile shows the times helped and the family's help
    const pastId = seedId('project:WNT:2025');
    await ctx.upsert('projects', {
      id: pastId,
      program_id: seedId('program:HUM'),
      series_id: seriesId,
      code: 'WNT',
      year: 2025,
      period_from: '2025-01-01',
      period_to: '2025-12-31',
      name_bn: 'শীতবস্ত্র বিতরণ 2025',
      name_en: 'Winter Clothing 2025',
      description: demoName('গত বছরের বন্ধ প্রকল্প, ডেমো ডেটা'),
      status: 'closed',
      closed_at: SEED_AT,
      closed_by: userId('pm_hum'),
      workflow_definition_id: seedId(`workflow:distribution:${workflowVersionOf('distribution')}`),
      workflow_version: workflowVersionOf('distribution'),
      per_volunteer_limit: 50,
      cost_per_beneficiary: '1500.00',
      target_beneficiaries: 2000,
      ...ctx.audit(),
    });
    const pastFormId = seedId('form:WNT:2025');
    await ctx.upsert('forms', {
      id: pastFormId,
      project_id: pastId,
      key: 'helped_person',
      title_bn: 'আবেদন ফর্ম',
      title_en: 'Application form',
      ...ctx.audit(),
    });
    const pastVersionId = seedId('form-version:WNT:2025:1');
    await ctx.upsert('form_versions', {
      id: pastVersionId,
      form_id: pastFormId,
      version_no: 1,
      ...ctx.audit(),
    });
    const helpedId = seedId(`beneficiary:${DEMO_HELPED_BENEFICIARY.n}`);
    const helped = DEMO_HELPED_BENEFICIARY;
    await ctx.upsert('beneficiaries', {
      id: helpedId,
      nid: helped.nid,
      birth_reg: null,
      name: demoName(helped.name),
      father_or_husband_name: demoName(helped.father),
      ...nameKeys(demoName(helped.name), demoName(helped.father), 'নমুনা গ্রাম 4'),
      mobile: fakeMobile(helped.mobile),
      gender_code: 'female',
      age_years: 52,
      marital_status_code: 'widowed',
      education_code: 'primary',
      division_id: place.division,
      district_id: place.district,
      upazila_id: place.upazila,
      union_id: place.union,
      village: 'নমুনা গ্রাম 4',
      members_14_plus: 1,
      children_under_14: 2,
      daily_income: '200',
      ...ctx.audit(),
    });
    // a merge or its revert moves the row, as for the pairs above; a later seed run leaves it
    await ctx.upsert(
      'applications',
      {
        id: seedId(`application:WNT:2025:${helped.n}`),
        project_id: pastId,
        form_version_id: pastVersionId,
        beneficiary_id: helpedId,
        // closed with its session, approved before the close: it counts as help
        status: 'closed',
        closed_from_status: 'approved',
        region_location_id: place.division,
        district_id: place.district,
        union_id: place.union,
        submitted_at: SEED_AT,
        approved_at: SEED_AT,
        approved_by: userId('rpm_dhaka'),
        ...ctx.audit(),
      },
      { insertOnly: ['beneficiary_id', 'status', 'closed_from_status'] },
    );
    // the kept times helped, written only where they differ
    await writeHelpCounts(ctx.db, [helpedId]);
    await seedReadyForm(ctx, userId('department_head'));
  });
}

/** A question of the demo ready form, required unless said otherwise. */
const question = (
  fieldKey: string,
  type: FormField['type'],
  label: { bn: string; en: string },
  extra: Partial<FormField> = {},
): FormField =>
  ({
    fieldKey,
    libraryFieldKey: null,
    type,
    label,
    required: true,
    standardColumn: null,
    settings: {},
    options: [],
    ...extra,
  }) as FormField;

/**
 * A published ready form for beneficiary applications, so a PM can place one on a project in a
 * test without building it first: the seven identity questions, each marked by its column, and
 * the family's size. Its rows are written once; a second run leaves a form that exists alone.
 */
async function seedReadyForm(ctx: SeedContext, actor: string): Promise<void> {
  const formId = seedId('form:ready:beneficiary');
  const versionId = seedId('form-version:ready:beneficiary:1');
  await ctx.upsert('forms', {
    id: formId,
    project_id: null,
    key: 'demo_beneficiary_application',
    kind: 'beneficiary_application',
    title_bn: 'উপকারভোগীর আবেদন (নমুনা)',
    title_en: 'Beneficiary application (sample)',
    ...ctx.audit(),
  });
  const written = await ctx.db.formSection.count({ where: { formVersionId: versionId } });
  // the version is written as a draft, takes its rows, and is published once
  await ctx.upsert('form_versions', {
    id: versionId,
    form_id: formId,
    version_no: 1,
    ...ctx.audit(),
  });
  if (written > 0) return;
  const definition = publishDefinitionSchema('beneficiary_application').parse({
    sections: [
      {
        key: 'identity',
        librarySectionKey: null,
        title: { bn: 'পরিচয়', en: 'Identity' },
        visibility: 'volunteer',
        condition: null,
        fields: [
          question(
            'nid_or_birth_reg',
            'short_text',
            {
              bn: 'জাতীয় পরিচয়পত্র বা জন্মনিবন্ধন নম্বর',
              en: 'NID or birth registration number',
            },
            { standardColumn: 'nid_or_birth_reg' },
          ),
          question(
            'name',
            'short_text',
            { bn: 'উপকারভোগীর নাম', en: "Beneficiary's name" },
            { standardColumn: 'name' },
          ),
          question(
            'father_or_husband_name',
            'short_text',
            { bn: 'পিতা বা স্বামীর নাম', en: "Father's or husband's name" },
            { standardColumn: 'father_or_husband_name' },
          ),
          question(
            'mobile',
            'phone',
            { bn: 'মোবাইল নম্বর', en: 'Mobile number' },
            { standardColumn: 'mobile' },
          ),
          question(
            'gender',
            'single_select',
            { bn: 'লিঙ্গ', en: 'Gender' },
            { standardColumn: 'gender_code' },
          ),
          question(
            'address',
            'bd_address',
            { bn: 'ঠিকানা', en: 'Address' },
            { standardColumn: 'division_id,district_id,upazila_id,union_id' },
          ),
          question(
            'village',
            'short_text',
            { bn: 'গ্রাম', en: 'Village' },
            { standardColumn: 'village' },
          ),
          question(
            'family_size',
            'number',
            { bn: 'পরিবারের সদস্য সংখ্যা', en: 'Family members' },
            { settings: { validation: { min: 1, max: 30 } } },
          ),
        ],
      },
    ],
  });
  await writeDefinitionRows(ctx.db, versionId, definition, actor);
  await ctx.db.formVersion.update({
    where: { id: versionId },
    data: { status: 'published', publishedAt: SEED_AT, publishedBy: actor },
  });
}
