// The records the contract cases read, built through the API on the seeded E2E database as the
// office would build them: an active project with its published application form, a volunteer
// assigned to it, and an application approved by the region's RPM.
import { randomUUID } from 'node:crypto';
import { isoDateInDhaka } from '@css/shared/format';
import { z } from 'zod';
import {
  applicationFormSchema,
  applicationSchema,
  locationSchema,
  myProjectDetailSchema,
} from '../../../src/api/schemas';
import { at, type Caller, call, type Sent, signIn } from './session';

/** The demo accounts the cases act as (docs/testing/DEMO_ACCOUNTS.md). */
/** The Main Admin: the office addresses are the Admin's alone. */
export const ADMIN = 'CSS-000';
export const HEAD = 'CSS-001';
export const MONITORING = 'CSS-002';
export const PM_HUM = 'CSS-102';
export const RPM_DHAKA = 'CSS-201';
export const MEDIA_MEMBER = 'CSS-402';

/** A 1 x 1 PNG, the photo every upload of the cases sends. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export const digits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

/** A record read for its id alone. */
export const withId = z.object({ id: z.uuid() });
/** An answer whose `data` the step does not read (it reads the version in `meta`, or nothing). */
export const unread = z.unknown();

/**
 * The answer's `data`, parsed with the schema of what the step reads, and the version in `meta`,
 * once its status is the expected one; any other status or shape throws, naming the step.
 */
export function must<T>(
  sent: Sent,
  status: number,
  what: string,
  data: z.ZodType<T>,
): { data: T; meta: { etag?: string } } {
  if (sent.status !== status)
    throw new Error(`${what}: ${sent.status} ${JSON.stringify(sent.body)}`);
  const envelope: z.ZodType<{ data: T; meta: { etag?: string } }> = z.object({
    data,
    meta: z.object({ etag: z.string().optional() }),
  });
  const parsed = envelope.safeParse(sent.body);
  if (!parsed.success) throw new Error(`${what}: ${parsed.error.message}`);
  return parsed.data;
}

/** Asks again every half second, for up to 20 seconds, until the answer is the awaited one. */
export async function until<T>(ask: () => Promise<T>, done: (answer: T) => boolean): Promise<T> {
  for (let tries = 0; ; tries += 1) {
    const answer = await ask();
    if (done(answer) || tries >= 40) return answer;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/**
 * A day some days from today in Dhaka, as `yyyy-mm-dd`: the server counts days there, so a date
 * taken in UTC would be yesterday's between midnight and six in the morning.
 */
export const day = (offset: number) => isoDateInDhaka(new Date(Date.now() + offset * 86_400_000));

const question = (fieldKey: string, type: string, extra: Record<string, unknown> = {}) => ({
  fieldKey,
  libraryFieldKey: null,
  type,
  label: { bn: 'প্রশ্ন', en: 'Question' },
  required: true,
  standardColumn: null,
  settings: {},
  options: [],
  ...extra,
});
const choice = (code: string) => ({
  code,
  label: { bn: code, en: code },
  dependsOnOptionCode: null,
  allowsOtherText: false,
});

/** The identity questions, a note and a photo the public link may ask for too. */
export const APPLICATION_SECTIONS = [
  {
    key: 'section_1',
    librarySectionKey: null,
    title: { bn: 'পরিচয়', en: 'Identity' },
    visibility: 'volunteer',
    condition: null,
    fields: [
      question('q_id', 'short_text', { standardColumn: 'nid_or_birth_reg' }),
      question('q_name', 'short_text', { standardColumn: 'name' }),
      question('q_father', 'short_text', { standardColumn: 'father_or_husband_name' }),
      question('q_mobile', 'phone', { standardColumn: 'mobile' }),
      question('q_gender', 'single_select', {
        standardColumn: 'gender_code',
        options: [choice('male'), choice('female')],
      }),
      question('q_address', 'bd_address', {
        standardColumn: 'division_id,district_id,upazila_id,union_id',
      }),
      question('q_village', 'short_text', { standardColumn: 'village' }),
      question('q_note', 'long_text', { required: false }),
      question('q_photo', 'photo', { required: false }),
    ],
  },
];

/** The form-level points of a scored form: a person never assisted before gets them all. */
const SCORING = { not_previously_assisted: 10 };

export interface Places {
  division: string;
  district: string;
  upazila: string;
  union: string;
}

/** The Savar union of Dhaka with the places above it, as an address answer names them. */
export async function savar(caller: Caller | null): Promise<Places> {
  const child = async (parentId: string | null, name: string) => {
    const rows = must(
      await call(caller, 'GET', `/locations${parentId ? `?parentId=${parentId}` : ''}`),
      200,
      'locations',
      z.array(locationSchema),
    ).data;
    const found = rows.find((r) => r.name.bn === name);
    if (!found) throw new Error(`no location ${name}`);
    return found.id;
  };
  const division = await child(null, 'ঢাকা');
  const district = await child(division, 'ঢাকা');
  const upazila = await child(district, 'সাভার');
  const union = await child(upazila, 'সাভার');
  return { division, district, upazila, union };
}

/** Who an application names: two applications naming the same person read as duplicates. */
export interface Person {
  name: string;
  father: string;
  mobile: string;
}

/**
 * A person of their own: a name, a father's name and a mobile no other case uses, so no two
 * cases' people read as one family or one person.
 */
export const newPerson = (): Person => ({
  name: `নমুনা উপকারভোগী ${digits(6)}`,
  father: `নমুনা পিতা ${digits(6)}`,
  mobile: `018${digits(8)}`,
});

/** A person's answers to the project's form with a new identity number, at the Savar union. */
export function answers(places: Places, person: Partial<Person> = {}) {
  const { name, father, mobile } = { ...newPerson(), ...person };
  return [
    { fieldKey: 'q_id', value: { t: 'short_text', v: `3${digits(9)}` } },
    { fieldKey: 'q_name', value: { t: 'short_text', v: name } },
    { fieldKey: 'q_father', value: { t: 'short_text', v: father } },
    { fieldKey: 'q_mobile', value: { t: 'phone', v: mobile } },
    { fieldKey: 'q_gender', value: { t: 'single_select', v: 'female' } },
    {
      fieldKey: 'q_address',
      value: {
        t: 'bd_address',
        division_id: places.division,
        district_id: places.district,
        upazila_id: places.upazila,
        union_id: places.union,
      },
    },
    { fieldKey: 'q_village', value: { t: 'short_text', v: 'পূর্বপাড়া' } },
  ];
}

/**
 * A project code of its own: C and seven capital letters from a random UUID's hex digits (A for
 * 0 to P for 15), so the runs on one long-lived database never meet a code already taken.
 */
const projectCode = () =>
  `C${[...randomUUID().replace(/-/g, '').slice(0, 7)]
    .map((hex) => String.fromCharCode(65 + parseInt(hex, 16)))
    .join('')}`;

/**
 * The first step of the setup for a new Humanitarian project: its series is made here, and the
 * body of its first session, for the whole of this year, is answered for `POST /projects`.
 */
export async function firstSessionBody(
  caller: Caller,
  name: { bn: string; en: string } = { bn: 'চুক্তি পরীক্ষা', en: 'Contract test' },
): Promise<Record<string, unknown>> {
  const programs = must(
    await call(caller, 'GET', '/programs'),
    200,
    'programs',
    z.array(z.object({ id: z.uuid(), code: z.string() })),
  ).data;
  const seriesId = must(
    await call(caller, 'POST', '/project-series', {
      programId: programs.find((p) => p.code === 'HUM')!.id,
      code: projectCode(),
      name,
    }),
    201,
    'project series',
    withId,
  ).data.id;
  const year = new Date().getFullYear();
  return {
    seriesId,
    periodFrom: `${year}-01`,
    periodTo: `${year}-12`,
    source: { kind: 'workflow', workflowKey: 'distribution' },
  };
}

/** A draft Humanitarian project of this year, made by its PM through the API; answers its id. */
export async function draftProject(pm: Caller): Promise<string> {
  return must(
    await call(pm, 'POST', '/projects', await firstSessionBody(pm)),
    201,
    'project',
    withId,
  ).data.id;
}

export interface ActiveProject {
  projectId: string;
  /** The project's application form (its id, not a version's). */
  formId: string;
  places: Places;
}

/**
 * An active Humanitarian project of this run: a window around today, a budget from general
 * donations, the Dhaka division with its RPM, the rules, and the application form built and
 * published by the Monitoring Team and placed by the PM; with `scoring`, the form gives the
 * priority score's points.
 */
export async function activeProject(options: { scoring?: boolean } = {}): Promise<ActiveProject> {
  const pm = await signIn(PM_HUM);
  const [rpm] = must(
    await call(pm, 'GET', `/users?q=${RPM_DHAKA}`),
    200,
    'rpm',
    z.array(withId),
  ).data;
  const places = await savar(pm);
  const projectId = await draftProject(pm);
  const etag = async () =>
    must(await call(pm, 'GET', `/projects/${projectId}`), 200, 'project read', unread).meta.etag ??
    '';
  must(
    await call(
      pm,
      'PATCH',
      `/projects/${projectId}`,
      {
        applyFrom: day(-7),
        applyTo: day(60),
        perVolunteerLimit: 50,
        costPerBeneficiary: '1000.00',
        targetBeneficiaries: 100,
      },
      { 'If-Match': await etag() },
    ),
    200,
    'basics',
    unread,
  );
  must(
    await call(pm, 'PATCH', `/projects/${projectId}/fund-sources`, {
      fundSources: [{ source: 'general', amount: '100000.00' }],
    }),
    200,
    'fund sources',
    unread,
  );
  must(
    await call(pm, 'POST', `/projects/${projectId}/areas`, {
      locationId: places.division,
      rpmUserId: rpm!.id,
    }),
    201,
    'area',
    unread,
  );
  const components = must(
    await call(pm, 'GET', `/projects/${projectId}/components`),
    200,
    'components',
    z.array(
      z.object({
        componentKey: z.string(),
        etag: z.string(),
        settings: z.record(z.string(), z.unknown()),
      }),
    ),
  ).data;
  const distribution = components.find((c) => c.componentKey === 'distribution')!;
  must(
    await call(
      pm,
      'PATCH',
      `/projects/${projectId}/components/distribution`,
      { settings: { ...distribution.settings, rule: 'group' } },
      { 'If-Match': distribution.etag },
    ),
    200,
    'photo rule',
    unread,
  );
  const text = (bn: string) => ({ bn, en: `${bn} (en)` });
  must(
    await call(pm, 'PUT', `/projects/${projectId}/rules`, {
      volunteer_duties: text('দায়িত্ব'),
      implementation_process: text('প্রক্রিয়া'),
      misconduct: text('অনিয়ম'),
    }),
    200,
    'rules',
    unread,
  );
  const builder = await signIn(MONITORING);
  const ready = must(
    await call(builder, 'POST', '/ready-forms', {
      key: `contract_${randomUUID().slice(0, 8)}`,
      title: { bn: 'আবেদন', en: 'Application' },
      kind: 'beneficiary_application',
      source: { kind: 'blank' },
    }),
    201,
    'ready form',
    z.object({ id: z.uuid(), draftVersionId: z.uuid() }),
  ).data;
  const versionEtag = async () =>
    must(
      await call(builder, 'GET', `/form-versions/${ready.draftVersionId}`),
      200,
      'version',
      unread,
    ).meta.etag ?? '';
  must(
    await call(
      builder,
      'PATCH',
      `/form-versions/${ready.draftVersionId}`,
      { sections: APPLICATION_SECTIONS, ...(options.scoring ? { scoring: SCORING } : {}) },
      { 'If-Match': await versionEtag() },
    ),
    200,
    'form draft',
    unread,
  );
  must(
    await call(builder, 'POST', `/form-versions/${ready.draftVersionId}/publish`, undefined, {
      'If-Match': await versionEtag(),
    }),
    200,
    'publish',
    unread,
  );
  const placed = must(
    await call(pm, 'POST', `/projects/${projectId}/forms/place`, {
      readyFormId: ready.id,
      key: 'default',
    }),
    201,
    'place form',
    withId,
  ).data;
  must(
    await call(pm, 'POST', at`/projects/${projectId}/${'activate'}`, undefined, {
      'If-Match': await etag(),
    }),
    200,
    'activate',
    unread,
  );
  return { projectId, formId: placed.id, places };
}

/**
 * The project's identity rules changed by its PM, as the setup screen saves them: the settings of
 * the application form component with the given keys replaced.
 */
export async function identityRulesOn(
  projectId: string,
  rules: Partial<
    Record<'identity_document' | 'mobile', 'required' | 'optional'> &
      Record<'repeat_person' | 'repeat_family', 'tell' | 'hold'>
  >,
): Promise<void> {
  const pm = await signIn(PM_HUM);
  const component = must(
    await call(pm, 'GET', `/projects/${projectId}/components`),
    200,
    'components',
    z.array(
      z.object({
        componentKey: z.string(),
        etag: z.string(),
        settings: z.record(z.string(), z.unknown()),
      }),
    ),
  ).data.find((c) => c.componentKey === 'application_form');
  if (!component) throw new Error(`no application form component on ${projectId}`);
  must(
    await call(
      pm,
      'PATCH',
      `/projects/${projectId}/components/application_form`,
      { settings: { ...component.settings, ...rules } },
      { 'If-Match': component.etag },
    ),
    200,
    'identity rules',
    unread,
  );
}

/** The volunteer's id by the mobile they sign in with. */
export async function volunteerIdOf(head: Caller, mobile: string): Promise<string> {
  const [found] = must(
    await call(head, 'GET', `/volunteers?q=${mobile}`),
    200,
    'volunteer',
    z.array(withId),
  ).data;
  return found!.id;
}

/** The volunteer assigned to the project by the Department Head, who then accepts its rules. */
export async function assign(projectId: string, mobile: string): Promise<Caller> {
  const head = await signIn(HEAD);
  must(
    await call(head, 'POST', `/projects/${projectId}/volunteers`, {
      volunteers: [{ volunteerId: await volunteerIdOf(head, mobile) }],
    }),
    201,
    'assign',
    unread,
  );
  return signIn(mobile);
}

/** Moves an application with the version it has now. */
export async function act(caller: Caller, id: string, action: string, body: unknown = {}) {
  const { etag } = must(
    await call(caller, 'GET', `/applications/${id}`),
    200,
    'application',
    applicationSchema,
  ).meta;
  return must(
    await call(caller, 'POST', at`/applications/${id}/actions/${action}`, body, {
      'If-Match': etag ?? '',
    }),
    200,
    action,
    applicationSchema,
  );
}

/** The volunteer's rules consent on the project, as the consent screen sends it. */
export async function consent(volunteer: Caller, projectId: string) {
  const { rules } = must(
    await call(volunteer, 'GET', `/me/projects/${projectId}`),
    200,
    'my project',
    myProjectDetailSchema,
  ).data;
  return call(volunteer, 'POST', `/me/projects/${projectId}/consent`, {
    rulesVersion: rules.version,
    decision: 'accepted',
    parts: rules.parts.map((p) => p.part),
  });
}

/**
 * An application of a person (a new one unless given) on the project by the volunteer, sent to
 * the office; its person's profile is made at the send. Answers the application and the profile.
 * With `document: false` the identity number is left out, for a project that asks it only "if
 * they have one".
 */
export async function sentApplication(
  project: ActiveProject,
  volunteer: Caller,
  person: Partial<Person> = {},
  options: { document?: boolean } = {},
): Promise<{ id: string; beneficiaryId: string }> {
  const form = must(
    await call(volunteer, 'GET', `/projects/${project.projectId}/application-form`),
    200,
    'form',
    applicationFormSchema,
  ).data;
  const made = must(
    await call(volunteer, 'POST', `/projects/${project.projectId}/applications`, {
      clientUuid: randomUUID(),
      projectId: project.projectId,
      formVersionId: form.id,
      clientCreatedAt: new Date().toISOString(),
      answers: answers(project.places, person).filter(
        (a) => options.document !== false || a.fieldKey !== 'q_id',
      ),
    }),
    201,
    'application',
    withId,
  ).data;
  const sent = await act(volunteer, made.id, 'submit');
  if (!sent.data.beneficiaryId) throw new Error(`no profile for application ${made.id}`);
  return { id: made.id, beneficiaryId: sent.data.beneficiaryId };
}

/**
 * An application of a new person on the project by the volunteer, sent and approved by the Dhaka
 * RPM through review and approval. Answers its id.
 */
export async function approvedApplication(
  project: ActiveProject,
  volunteer: Caller,
): Promise<string> {
  const { id } = await sentApplication(project, volunteer);
  const rpm = await signIn(RPM_DHAKA);
  await act(rpm, id, 'review');
  await act(rpm, id, 'send_for_approval');
  await act(rpm, id, 'approve');
  return id;
}
