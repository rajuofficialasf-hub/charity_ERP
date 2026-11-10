import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  areaSchema,
  fundSourceSchema,
  programRecordSchema,
  programSchema,
  projectComponentSchema,
  projectFormViewSchema,
  projectPageSchema,
  projectRecordSchema,
  projectSchema,
  quotaSchema,
  rulesVersionSchema,
  staffAccessSchema,
  staffCandidateSchema,
  templateSchema,
  topicSchema,
} from '../../src/api/schemas';
import { expectContract, expectEnvelope, expectStatus } from './support/expect';
import { newOfficial } from './support/people';
import { at, type Caller, call, contractBase, signIn } from './support/session';
import {
  activeProject,
  day,
  draftProject,
  HEAD,
  MONITORING,
  PM_HUM,
  savar,
} from './support/world';

// The programs and the projects of the admin area: a program made, edited and given a PM; a draft
// project read and set up through every section of the setup and cancelled; a project saved as a
// template; an active project's window extended, the project closed and reopened.
const REASON = 'চুক্তি পরীক্ষার কারণ';
/** The candidate search goes by name: the Dhaka RPM's and a new official's (support/people.ts). */
const RPM_NAME = encodeURIComponent('আরপিএম ঢাকা');
const OFFICIAL_NAME = 'চুক্তি কর্মকর্তা';
const text = (bn: string) => ({ bn, en: `${bn} (en)` });
/** Capital letters from a random UUID's hex digits (A for 0 to P for 15): a code no run reuses. */
const letters = (n: number) =>
  [...randomUUID().replace(/-/g, '').slice(0, n)]
    .map((hex) => String.fromCharCode(65 + parseInt(hex, 16)))
    .join('');

/** The project's version now, for the If-Match of a write. */
async function versionOf(caller: Caller, projectId: string): Promise<string> {
  return expectEnvelope(
    await call(caller, 'GET', `/projects/${projectId}`),
    200,
    projectRecordSchema,
  ).meta.etag;
}

describe.skipIf(!contractBase())('the programs', () => {
  it('makes a program, renames it and gives it a PM', async () => {
    const head = await signIn(HEAD);
    const made = expectContract(
      await call(head, 'POST', '/programs', {
        code: `CT${letters(8)}`,
        name: text('চুক্তি প্রোগ্রাম'),
      }),
      201,
      programSchema,
    );
    const all = expectContract(await call(head, 'GET', '/programs'), 200, z.array(programSchema));
    expect(all.map((p) => p.id)).toContain(made.id);
    const record = expectEnvelope(
      await call(head, 'GET', `/programs/${made.id}`),
      200,
      programRecordSchema,
    );
    const renamed = expectContract(
      await call(
        head,
        'PATCH',
        `/programs/${made.id}`,
        { name: text('চুক্তি প্রোগ্রাম (নতুন নাম)') },
        { 'If-Match': record.meta.etag },
      ),
      200,
      programSchema,
    );
    expect(renamed.name.bn).toContain('নতুন নাম');
    const pm = await newOfficial('program_manager');
    const given = expectContract(
      await call(head, 'POST', `/programs/${made.id}/pm`, { pmUserId: pm.userId }),
      200,
      programSchema,
    );
    expect(given.pmUserId).toBe(pm.userId);
  });
});

describe.skipIf(!contractBase())('the projects', () => {
  it('sets a draft up through every section, lists it and cancels it', async () => {
    const monitoring = await signIn(MONITORING);
    const programs = expectContract(
      await call(monitoring, 'GET', '/programs'),
      200,
      z.array(programSchema),
    );
    const made = expectContract(
      await call(monitoring, 'POST', '/projects', {
        programId: programs.find((p) => p.code === 'HUM')!.id,
        code: `C${letters(7)}`,
        year: new Date().getFullYear(),
        name: text('চুক্তি সেটআপ'),
        source: { kind: 'workflow', workflowKey: 'distribution' },
      }),
      201,
      projectSchema,
    );
    const id = made.id;
    expect(
      expectContract(await call(monitoring, 'GET', `/projects/${id}`), 200, projectSchema).status,
    ).toBe('draft');
    const updated = expectContract(
      await call(
        monitoring,
        'PATCH',
        `/projects/${id}`,
        { applyFrom: day(-7), applyTo: day(60), perVolunteerLimit: 20, targetBeneficiaries: 50 },
        { 'If-Match': await versionOf(monitoring, id) },
      ),
      200,
      projectSchema,
    );
    expect(updated.perVolunteerLimit).toBe(20);

    const components = expectContract(
      await call(monitoring, 'GET', `/projects/${id}/components`),
      200,
      z.array(projectComponentSchema),
    );
    const distribution = components.find((c) => c.componentKey === 'distribution')!;
    expectContract(
      await call(
        monitoring,
        'PATCH',
        at`/projects/${id}/components/${'distribution'}`,
        { settings: { ...distribution.settings, rule: 'group' } },
        { 'If-Match': distribution.etag ?? '' },
      ),
      200,
      projectComponentSchema,
    );
    expectContract(
      await call(monitoring, 'GET', `/projects/${id}/forms`),
      200,
      z.array(projectFormViewSchema),
    );
    const funds = expectContract(
      await call(monitoring, 'PATCH', `/projects/${id}/fund-sources`, {
        fundSources: [{ source: 'general', amount: '50000.00' }],
      }),
      200,
      z.array(fundSourceSchema),
    );
    expect(funds).toHaveLength(1);
    expectContract(
      await call(monitoring, 'GET', `/projects/${id}/fund-sources`),
      200,
      z.array(fundSourceSchema),
    );

    const places = await savar(monitoring);
    const [rpm] = expectContract(
      await call(
        monitoring,
        'GET',
        at`/projects/${id}/candidates?role=${'regional_program_manager'}&q=${RPM_NAME}`,
      ),
      200,
      z.array(staffCandidateSchema),
    );
    const areas = expectContract(
      await call(monitoring, 'POST', `/projects/${id}/areas`, {
        locationId: places.division,
        rpmUserId: rpm!.id,
      }),
      201,
      z.array(areaSchema),
    );
    expect(
      expectContract(
        await call(monitoring, 'GET', `/projects/${id}/areas`),
        200,
        z.array(areaSchema),
      ),
    ).toHaveLength(1);
    const quotas = expectContract(
      await call(monitoring, 'PATCH', `/projects/${id}/quotas`, {
        quotas: [{ level: 'district', locationId: places.district, target: 10 }],
      }),
      200,
      z.array(quotaSchema),
    );
    expect(quotas[0]?.target).toBe(10);
    expectContract(
      await call(monitoring, 'GET', `/projects/${id}/quotas`),
      200,
      z.array(quotaSchema),
    );

    const official = await newOfficial('project_executive');
    expectContract(
      await call(
        monitoring,
        'GET',
        `/projects/${id}/candidates?role=project_executive&q=${encodeURIComponent(OFFICIAL_NAME)}`,
      ),
      200,
      z.array(staffCandidateSchema),
    );
    const staff = expectContract(
      await call(monitoring, 'POST', `/projects/${id}/staff`, {
        userId: official.userId,
        roleKey: 'project_executive',
      }),
      201,
      z.array(staffAccessSchema),
    );
    const access = staff.find((s) => s.userId === official.userId)!;
    expectContract(
      await call(monitoring, 'GET', `/projects/${id}/staff`),
      200,
      z.array(staffAccessSchema),
    );
    expectStatus(
      await call(monitoring, 'POST', `/project-staff/${access.id}/end`, { reason: REASON }),
      204,
    );

    const topics = expectContract(
      await call(monitoring, 'PUT', `/projects/${id}/syllabus`, {
        topics: [{ title: text('ওযু') }],
      }),
      200,
      z.array(topicSchema),
    );
    expect(topics).toHaveLength(1);
    expectContract(
      await call(monitoring, 'GET', `/projects/${id}/syllabus`),
      200,
      z.array(topicSchema),
    );
    expect(
      expectContract(
        await call(monitoring, 'GET', `/projects/${id}/rules`),
        200,
        rulesVersionSchema,
      ).version,
    ).toBe(0);
    expect(
      expectContract(
        await call(monitoring, 'PUT', `/projects/${id}/rules`, {
          volunteer_duties: text('দায়িত্ব'),
          implementation_process: text('প্রক্রিয়া'),
          misconduct: text('অনিয়ম'),
        }),
        200,
        rulesVersionSchema,
      ).version,
    ).toBe(1);

    const page = expectEnvelope(
      await call(monitoring, 'GET', '/projects?status=draft&include=total'),
      200,
      projectPageSchema,
    );
    expect(page.meta.total).toBeGreaterThan(0);
    expectContract(
      await call(monitoring, 'GET', '/projects?limit=100'),
      200,
      z.array(projectSchema),
    );
    expectStatus(await call(monitoring, 'POST', `/project-areas/${areas[0]!.id}/remove`, {}), 204);
    expect(
      expectContract(
        await call(monitoring, 'POST', `/projects/${id}/cancel`, { reason: REASON }),
        200,
        projectSchema,
      ).status,
    ).toBe('cancelled');
  });

  it('saves a project as a template, reads the library and deactivates the template', async () => {
    const pm = await signIn(PM_HUM);
    const projectId = await draftProject(pm);
    const saved = expectContract(
      await call(pm, 'POST', `/projects/${projectId}/save-as-template`, {
        name: text(`চুক্তি টেমপ্লেট ${letters(4)}`),
        description: 'চুক্তি পরীক্ষার টেমপ্লেট',
      }),
      200,
      templateSchema,
    );
    expect(saved.sourceProjectId).toBe(projectId);
    const library = expectContract(
      await call(pm, 'GET', '/templates'),
      200,
      z.array(templateSchema),
    );
    expect(library.map((t) => t.id)).toContain(saved.id);
    const off = expectContract(
      await call(pm, 'PATCH', `/templates/${saved.id}`, { active: false }),
      200,
      templateSchema,
    );
    expect(off.active).toBe(false);
    const everything = expectContract(
      await call(pm, 'GET', '/templates?include=inactive'),
      200,
      z.array(templateSchema),
    );
    expect(everything.map((t) => t.id)).toContain(saved.id);
  });

  it('extends an active project’s window, closes it in two steps and reopens it', async () => {
    const { projectId } = await activeProject();
    const pm = await signIn(PM_HUM);
    const move = async (action: string, body: object) =>
      expectContract(
        await call(pm, 'POST', at`/projects/${projectId}/${action}`, body, {
          'If-Match': await versionOf(pm, projectId),
        }),
        200,
        projectSchema,
      );
    expect((await move('extend-deadline', { newApplyTo: day(90), reason: REASON })).applyTo).toBe(
      day(90),
    );
    expect((await move('start-closing', { reason: REASON })).status).toBe('closing');
    expect((await move('close', { reason: REASON })).status).toBe('closed');
    expect((await move('reopen', { reason: REASON })).status).toBe('active');
    const page = expectEnvelope(
      await call(pm, 'GET', '/projects?status=active&limit=1&include=total'),
      200,
      projectPageSchema,
    );
    expect(page.meta.total).toBeGreaterThan(0);
  });
});
