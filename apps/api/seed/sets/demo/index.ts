import {
  componentSettingsSchema,
  demoName,
  fakeBirthReg,
  fakeEmail,
  fakeMobile,
  fakeNid,
} from '@css/shared';
import { hash } from '@node-rs/argon2';
import { json, SEED_AT, type SeedContext, seedId } from '../../context';
import { inTransaction } from '../util';

/**
 * Demo set (T1.3): one account per official role, 20 volunteers, 50 beneficiaries in two
 * divisions and one draft winter project. Every identity is obviously fake (TEST_STRATEGY §4);
 * the shared password is listed in docs/testing/DEMO_ACCOUNTS.md (development only).
 * Later tasks extend this set as their entities become functional.
 */
export const DEMO_PASSWORD = 'CssDemo2026';
const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 } as const; // Argon2id, D-063

export interface DemoStaff {
  key: string;
  role: string;
  name: string;
  email: string;
  mobileIndex: number;
  designation: string;
  /** The organisation's job ID, the login id of an official (DECISION_LOG D-097). */
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
    key: 'department_head',
    role: 'department_head',
    name: 'ডিপার্টমেন্ট হেড',
    email: 'head',
    mobileIndex: 1,
    designation: 'Department Head',
    jobId: 'CSS-001',
  },
  {
    key: 'monitoring',
    role: 'monitoring_team',
    name: 'মনিটরিং কর্মকর্তা',
    email: 'monitoring',
    mobileIndex: 2,
    designation: 'Monitoring Team',
    jobId: 'CSS-002',
    supervisor: 'department_head',
  },
  {
    key: 'pm_ucd',
    role: 'program_manager',
    name: 'প্রোগ্রাম ম্যানেজার (স্বাবলম্বী)',
    email: 'pm.ucd',
    mobileIndex: 3,
    designation: 'Program Manager',
    jobId: 'CSS-101',
    supervisor: 'department_head',
  },
  {
    key: 'pm_hum',
    role: 'program_manager',
    name: 'প্রোগ্রাম ম্যানেজার (মানবিক)',
    email: 'pm.hum',
    mobileIndex: 4,
    designation: 'Program Manager',
    jobId: 'CSS-102',
    supervisor: 'department_head',
  },
  {
    key: 'pm_err',
    role: 'program_manager',
    name: 'প্রোগ্রাম ম্যানেজার (জরুরি সাড়া)',
    email: 'pm.err',
    mobileIndex: 5,
    designation: 'Program Manager',
    jobId: 'CSS-103',
    supervisor: 'department_head',
  },
  {
    key: 'rpm_dhaka',
    role: 'regional_program_manager',
    name: 'আরপিএম ঢাকা',
    email: 'rpm.dhaka',
    mobileIndex: 6,
    designation: 'Regional Program Manager',
    jobId: 'CSS-201',
    supervisor: 'pm_hum',
  },
  {
    key: 'rpm_rangpur',
    role: 'regional_program_manager',
    name: 'আরপিএম রংপুর',
    email: 'rpm.rangpur',
    mobileIndex: 7,
    designation: 'Regional Program Manager',
    jobId: 'CSS-202',
    supervisor: 'pm_ucd',
  },
  {
    // the official of the handover journey (plan docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, U14): holds one project area, deactivated in E2E
    key: 'rpm_handover',
    role: 'regional_program_manager',
    name: 'আরপিএম হ্যান্ডওভার',
    email: 'handover.rpm',
    mobileIndex: 14,
    designation: 'Regional Program Manager',
    jobId: 'CSS-203',
    supervisor: 'pm_err',
  },
  {
    key: 'executive',
    role: 'project_executive',
    name: 'প্রজেক্ট এক্সিকিউটিভ',
    email: 'executive',
    mobileIndex: 8,
    designation: 'Project Executive',
    jobId: 'CSS-301',
    supervisor: 'rpm_dhaka',
  },
  {
    key: 'official_daee',
    role: 'official_daee',
    name: 'অফিসিয়াল দায়ী',
    email: 'daee',
    mobileIndex: 9,
    designation: 'Official দায়ী',
    jobId: 'CSS-302',
    supervisor: 'rpm_dhaka',
  },
  {
    key: 'implementer',
    role: 'implementer',
    name: 'বাস্তবায়নকারী',
    email: 'implementer',
    mobileIndex: 10,
    designation: 'Implementer',
    jobId: 'CSS-303',
    supervisor: 'rpm_dhaka',
  },
  {
    key: 'procurement',
    role: 'procurement_team',
    name: 'প্রকিউরমেন্ট কর্মকর্তা',
    email: 'procurement',
    mobileIndex: 11,
    designation: 'Procurement Team',
    jobId: 'CSS-401',
    supervisor: 'department_head',
  },
  {
    key: 'media_director',
    role: 'media_director',
    name: 'মিডিয়া ডিরেক্টর (নমুনা)',
    email: 'media.director',
    mobileIndex: 15,
    designation: 'Media Director',
    jobId: 'CSS-404',
    supervisor: 'department_head',
  },
  {
    key: 'media_ad',
    role: 'media_assistant_director',
    name: 'মিডিয়া অ্যাসিস্ট্যান্ট ডিরেক্টর (নমুনা)',
    email: 'media.ad',
    mobileIndex: 16,
    designation: 'Media Assistant Director',
    jobId: 'CSS-405',
    supervisor: 'media_director',
  },
  {
    key: 'media',
    role: 'media_team',
    name: 'মিডিয়া কর্মকর্তা',
    email: 'media',
    mobileIndex: 12,
    designation: 'Media Team',
    jobId: 'CSS-402',
    supervisor: 'media_ad',
  },
  {
    key: 'finance',
    role: 'finance_team',
    name: 'ফাইন্যান্স কর্মকর্তা',
    email: 'finance',
    mobileIndex: 13,
    designation: 'Finance Team',
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
/** 20 volunteers: 16 general, then one each of both, local দায়ী, team member and paid. */
export const DEMO_VOLUNTEERS: { n: number; type: VolunteerType }[] = Array.from(
  { length: 20 },
  (_, i) => ({
    n: i + 1,
    type: (['general', 'both', 'local_daee', 'team_member', 'paid'] as const)[Math.max(0, i - 15)]!,
  }),
);

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
  const res = await ctx.db.query<UnionRef>(
    `SELECT dv.id AS division, d.id AS district, up.id AS upazila, u.id AS "union"
     FROM locations u
     JOIN locations up ON up.id = u.parent_id
     JOIN locations d ON d.id = up.parent_id
     JOIN locations dv ON dv.id = d.parent_id
     WHERE dv.level = 'division' AND dv.name_en = $1 AND u.kind = 'union' AND u.active
     ORDER BY u.code LIMIT $2`,
    [divisionEn, count],
  );
  if (res.rows.length < count)
    throw new Error(`demo seed needs ${count} unions in ${divisionEn}; run the base set first`);
  return res.rows;
}

export async function seedDemo(ctx: SeedContext): Promise<void> {
  await inTransaction(ctx.db, async () => {
    const passwordHash = await hash(DEMO_PASSWORD, ARGON2);
    const userId = (key: string) => seedId(`user:${key}`);
    const dhaka = await unionsOf(ctx, 'Dhaka', 25);
    const rangpur = await unionsOf(ctx, 'Rangpur', 25);
    const divisionIdOf = (key: string) =>
      key === 'rpm_rangpur' ? rangpur[0]!.division : dhaka[0]!.division;

    // staff accounts and their roles; a PM's home program is filled in once the program exists
    const homeProgram = (s: DemoStaff) =>
      s.key.startsWith('pm_') ? seedId(`program:${s.key.slice(3).toUpperCase()}`) : null;
    const staffRow = (s: DemoStaff, withProgram: boolean) => ({
      id: userId(s.key),
      kind: 'staff',
      email: fakeEmail(s.email),
      mobile: fakeMobile(s.mobileIndex),
      password_hash: passwordHash,
      state: 'active',
      is_system_owner: s.key === 'department_head',
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
    for (const s of DEMO_STAFF) {
      await ctx.upsert('users', s.key.startsWith('pm_') ? staffRow(s, false) : staffRow(s, true), {
        insertOnly: ['password_hash'],
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
      await ctx.upsert('users', staffRow(s, true), { insertOnly: ['password_hash'] });
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

    // volunteers (the team member refers to volunteer 1 by NID, BR-040)
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
      await ctx.upsert('beneficiaries', {
        id: seedId(`beneficiary:${i + 1}`),
        nid: byBirthReg ? null : fakeNid(1000 + i),
        birth_reg: byBirthReg ? fakeBirthReg(i + 1) : null,
        name: demoName((female ? FEMALE : MALE)[i % 10]!),
        father_or_husband_name: demoName(FATHERS[i % 5]!),
        mobile: fakeMobile(1000 + i),
        gender_code: female ? 'female' : 'male',
        age_years: 25 + ((i * 7) % 50),
        marital_status_code: ['married', 'widowed', 'never_married', 'divorced'][i % 4],
        education_code: ['illiterate', 'primary', 'secondary'][i % 3],
        division_id: place.division,
        district_id: place.district,
        upazila_id: place.upazila,
        union_id: place.union,
        village: `নমুনা গ্রাম ${(i % 12) + 1}`,
        members_14_plus: 1 + (i % 4),
        children_under_14: i % 3,
        daily_income: String(200 + (i % 6) * 50),
        ...ctx.audit(),
      });
    }

    // one draft winter project (distribution workflow) with its components
    const projectId = seedId('project:WNT:2026');
    await ctx.upsert('projects', {
      id: projectId,
      program_id: seedId('program:HUM'),
      code: 'WNT',
      year: 2026,
      name_bn: 'শীতবস্ত্র বিতরণ 2026',
      name_en: 'Winter Clothing 2026',
      description: demoName('খসড়া প্রকল্প, ডেমো ডেটা'),
      status: 'draft',
      workflow_definition_id: seedId('workflow:distribution:1'),
      workflow_version: 1,
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
    for (const [key, settings] of Object.entries(components)) {
      componentSettingsSchema(key).parse(settings);
      await ctx.upsert('project_components', {
        id: seedId(`project-component:WNT:${key}`),
        project_id: projectId,
        component_key: key,
        enabled: true,
        settings: json(settings),
        ...ctx.audit(),
      });
    }
  });
}
