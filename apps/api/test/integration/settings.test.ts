import { SETTING_DEFAULTS } from '@css/shared/settings';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accessWorld } from './support/access-fixtures';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app';

// The settings page and its lists: the Department Head and the Monitoring Team change them, every
// signed-in user reads the lists, every visitor reads the public details, each change audited.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  // the expense categories as the base seed writes them
  for (const [i, code] of ['decoration', 'vehicle_hire', 'food'].entries())
    await h.db.query(
      `INSERT INTO reference_lists (id, list_key, code, label_bn, label_en, sort_order) VALUES (gen_random_uuid(), 'expense_category_default', $1, $1, $1, $2) ON CONFLICT DO NOTHING`,
      [code, i + 1],
    );
});
afterAll(async () => h.close());

const thresholds = SETTING_DEFAULTS['monitoring.thresholds'];
const patchSetting = (s: Session, key: string, value: unknown) =>
  api().patch(`/api/v1/settings/${key}`).set(bearer(s)).send({ value });

async function audits(action: string, entityType: string) {
  const { rows } = await h.db.query<{ old: Record<string, unknown>; new: Record<string, unknown> }>(
    'SELECT old, new FROM audit_log WHERE action = $1 AND entity_type = $2 ORDER BY created_at, id',
    [action, entityType],
  );
  return rows;
}

describe('the settings page', () => {
  it('lists the organisation, the language defaults and the thresholds, never the SMS config', async () => {
    const head = await as(world.users.head);
    const res = await api().get('/api/v1/settings').set(bearer(head));
    expect(res.status).toBe(200);
    const byKey = Object.fromEntries(
      (res.body.data as { key: string; value: unknown }[]).map((s) => [s.key, s.value]),
    );
    expect(Object.keys(byKey).sort()).toEqual([
      'localization',
      'monitoring.thresholds',
      'organisation',
    ]);
    expect(byKey['monitoring.thresholds']).toEqual(thresholds);
    expect(JSON.stringify(res.body)).not.toContain('senderId');
  });

  it('changes a threshold with an audit entry holding the old and the new value', async () => {
    const monitoring = await as(world.users.monitoring);
    const res = await patchSetting(monitoring, 'monitoring.thresholds', {
      ...thresholds,
      reviewPendingDays: 8,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      key: 'monitoring.thresholds',
      value: { reviewPendingDays: 8 },
    });
    const [entry] = (await audits('settings.change', 'setting')).filter(
      (a) => a.new.key === 'monitoring.thresholds',
    );
    expect(entry?.old).toMatchObject({ value: { reviewPendingDays: 7 } });
    expect(entry?.new).toMatchObject({ value: { reviewPendingDays: 8 } });
    const read = await api().get('/api/v1/settings').set(bearer(monitoring));
    const stored = (read.body.data as { key: string; value: { reviewPendingDays: number } }[]).find(
      (s) => s.key === 'monitoring.thresholds',
    );
    expect(stored?.value.reviewPendingDays).toBe(8);
  });

  it('refuses a value out of range, naming the field', async () => {
    const head = await as(world.users.head);
    const res = await patchSetting(head, 'monitoring.thresholds', {
      ...thresholds,
      budgetAlertPercent: 120,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      expect.objectContaining({
        path: 'value.budgetAlertPercent',
        code: 'validation.out_of_range',
      }),
    ]);
  });

  it('knows only the keys of the page: an unknown key and the SMS config answer 404', async () => {
    const head = await as(world.users.head);
    expect((await patchSetting(head, 'alerts.other', 1)).status).toBe(404);
    expect(
      (await patchSetting(head, 'sms.provider', SETTING_DEFAULTS['sms.provider'])).status,
    ).toBe(404);
    expect((await patchSetting(head, 'seed.marker.base', {})).status).toBe(404);
  });

  it('refuses a PM, an RPM and a volunteer, reading and writing', async () => {
    for (const userId of [world.users.pm, world.users.rpmDhaka, world.users.general]) {
      const s = await as(userId);
      expect((await api().get('/api/v1/settings').set(bearer(s))).status).toBe(403);
      expect((await patchSetting(s, 'monitoring.thresholds', thresholds)).status).toBe(403);
    }
  });

  it('keeps the organisation phone and reads the language defaults back', async () => {
    const head = await as(world.users.head);
    const organisation = { ...SETTING_DEFAULTS.organisation, phone: '01711000000' };
    expect((await patchSetting(head, 'organisation', organisation)).status).toBe(200);
    expect((await patchSetting(head, 'localization', { defaultLanguage: 'en' })).status).toBe(200);
    const pub = await api().get('/api/v1/public/settings');
    expect(pub.status).toBe(200);
    expect(pub.body.data).toEqual({ defaultLanguage: 'en', organisation });
    // back to the defaults for the other tests
    await patchSetting(head, 'localization', SETTING_DEFAULTS.localization);
  });
});

describe('without a session', () => {
  it('answers 401 on the settings page and the list writes', async () => {
    expect((await api().get('/api/v1/settings')).status).toBe(401);
    expect((await api().patch('/api/v1/settings/organisation').send({ value: {} })).status).toBe(
      401,
    );
    expect(
      (
        await api()
          .post('/api/v1/reference-lists/issue_type_default')
          .send({ code: 'x', label: {} })
      ).status,
    ).toBe(401);
  });
});

describe('the public settings', () => {
  it('answer without a session with the language and the organisation only', async () => {
    const res = await api().get('/api/v1/public/settings');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(['defaultLanguage', 'organisation']);
    expect(JSON.stringify(res.body)).not.toMatch(/reviewPendingDays|senderId|endpoint/);
  });
});

describe('the expense category and issue type lists', () => {
  const list = '/api/v1/reference-lists/expense_category_default';

  it('every signed-in user reads a list; an unknown list is 404', async () => {
    const volunteer = await as(world.users.general);
    const res = await api().get(list).set(bearer(volunteer));
    expect(res.status).toBe(200);
    expect((res.body.data as { code: string }[]).map((i) => i.code)).toEqual([
      'decoration',
      'vehicle_hire',
      'food',
    ]);
    expect(
      (await api().get('/api/v1/reference-lists/no_such_list').set(bearer(volunteer))).status,
    ).toBe(404);
    expect((await api().get(list)).status).toBe(401);
  });

  it('adds at the end, relabels, reorders and deactivates, each audited; nothing is deleted', async () => {
    const head = await as(world.users.head);
    const added = await api()
      .post(list)
      .set(bearer(head))
      .send({ code: 'banner_print', label: { bn: 'ব্যানার ছাপা', en: 'Banner printing' } });
    expect(added.status).toBe(201);
    expect(added.body.data).toEqual({
      code: 'banner_print',
      label: { bn: 'ব্যানার ছাপা', en: 'Banner printing' },
      active: true,
      sortOrder: 4,
      system: false,
      kind: null,
    });
    const item = `${list}/items/banner_print`;
    const relabelled = await api()
      .patch(item)
      .set(bearer(head))
      .send({ label: { bn: 'ব্যানার', en: 'Banner' }, sortOrder: 0, active: false });
    expect(relabelled.status).toBe(200);
    expect(relabelled.body.data).toMatchObject({
      label: { en: 'Banner' },
      sortOrder: 0,
      active: false,
    });
    const entries = (await audits('settings.change', 'reference_list')).filter(
      (a) => a.new.code === 'banner_print',
    );
    expect(entries).toHaveLength(2);
    expect(entries[1]?.old).toMatchObject({ active: true, label: { en: 'Banner printing' } });
    const read = await api().get(list).set(bearer(head));
    expect((read.body.data as { code: string; active: boolean }[])[0]).toMatchObject({
      code: 'banner_print',
      active: false,
    });
  });

  it('refuses a code already in the list, a bad code, a fixed list and a missing item', async () => {
    const head = await as(world.users.head);
    const label = { bn: 'খাবার', en: 'Food' };
    expect((await api().post(list).set(bearer(head)).send({ code: 'food', label })).status).toBe(
      409,
    );
    const bad = await api().post(list).set(bearer(head)).send({ code: 'Food item', label });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details[0]).toMatchObject({ path: 'code', code: 'validation.list_code' });
    expect(
      (
        await api()
          .post('/api/v1/reference-lists/gender')
          .set(bearer(head))
          .send({ code: 'other', label })
      ).status,
    ).toBe(404);
    expect(
      (await api().patch(`${list}/items/no_such_item`).set(bearer(head)).send({ active: false }))
        .status,
    ).toBe(404);
  });

  it('refuses a PM and a volunteer changing an item, which stays as it was', async () => {
    for (const userId of [world.users.pm, world.users.general]) {
      const s = await as(userId);
      const res = await api().patch(`${list}/items/food`).set(bearer(s)).send({ active: false });
      expect(res.status).toBe(403);
    }
    const { rows } = await h.db.query(
      `SELECT active FROM reference_lists WHERE list_key = 'expense_category_default' AND code = 'food'`,
    );
    expect(rows[0].active).toBe(true);
  });

  it('refuses a PM and a volunteer', async () => {
    for (const userId of [world.users.pm, world.users.general]) {
      const s = await as(userId);
      const res = await api()
        .post('/api/v1/reference-lists/issue_type_default')
        .set(bearer(s))
        .send({ code: 'flood', label: { bn: 'বন্যা', en: 'Flood' } });
      expect(res.status).toBe(403);
    }
  });
});

describe('the media lists', () => {
  const stages = '/api/v1/reference-lists/media_stage';
  const platforms = '/api/v1/reference-lists/media_platform';
  const label = (en: string) => ({ bn: en, en });
  // a system stage and a platform as the base seed writes them
  beforeAll(async () => {
    await h.db.query(
      `INSERT INTO reference_lists (id, list_key, code, label_bn, label_en, is_system) VALUES (gen_random_uuid(), 'media_stage', 'published', 'প্রকাশিত', 'Published', true) ON CONFLICT DO NOTHING`,
    );
    await h.db.query(
      `INSERT INTO reference_lists (id, list_key, code, label_bn, label_en, attributes) VALUES (gen_random_uuid(), 'media_platform', 'asf_youtube', 'YouTube', 'YouTube', '{"kind": "youtube"}') ON CONFLICT DO NOTHING`,
    );
  });

  it('add, rename and deactivate an ordinary stage, each audited, and keep a system stage active', async () => {
    const head = await as(world.users.head);
    const added = await api()
      .post(stages)
      .set(bearer(head))
      .send({ code: 'color_grading', label: label('Colour grading') });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    expect(added.body.data).toMatchObject({ system: false, kind: null });
    const renamed = await api()
      .patch(`${stages}/items/color_grading`)
      .set(bearer(head))
      .send({ label: label('Grading'), active: false });
    expect(renamed.body.data).toMatchObject({ active: false, label: { en: 'Grading' } });
    const audited = (await audits('settings.change', 'reference_list')).filter(
      (a) => a.new.code === 'color_grading',
    );
    expect(audited).toHaveLength(2);
    const list = await api().get(stages).set(bearer(head));
    expect(
      (list.body.data as { code: string; system: boolean }[]).find((i) => i.code === 'published'),
    ).toMatchObject({ system: true });
    const system = await api()
      .patch(`${stages}/items/published`)
      .set(bearer(head))
      .send({ active: false });
    expect(system.status).toBe(409);
    expect(system.body.error.code).toBe('reference.system_entry');
    // a system stage may still be relabelled
    expect(
      (
        await api()
          .patch(`${stages}/items/published`)
          .set(bearer(head))
          .send({ label: label('Published') })
      ).status,
    ).toBe(200);
  });

  it('give a platform its kind, required there and refused on the other lists', async () => {
    const head = await as(world.users.head);
    const noKind = await api()
      .post(platforms)
      .set(bearer(head))
      .send({ code: 'asf_website', label: label('Website') });
    expect(noKind.status).toBe(422);
    expect(noKind.body.error.details[0]).toMatchObject({
      path: 'kind',
      code: 'validation.required',
    });
    expect(
      (
        await api()
          .post(platforms)
          .set(bearer(head))
          .send({ code: 'asf_tiktok', label: label('TikTok'), kind: 'tiktok' })
      ).status,
    ).toBe(422);
    const added = await api()
      .post(platforms)
      .set(bearer(head))
      .send({ code: 'asf_website', label: label('Website'), kind: 'other' });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    expect(added.body.data.kind).toBe('other');
    const changed = await api()
      .patch(`${platforms}/items/asf_website`)
      .set(bearer(head))
      .send({ kind: 'youtube' });
    expect(changed.body.data.kind).toBe('youtube');
    expect(
      (
        await api()
          .post('/api/v1/reference-lists/media_role')
          .set(bearer(head))
          .send({ code: 'drone_pilot', label: label('Drone pilot'), kind: 'other' })
      ).status,
    ).toBe(422);
  });

  it('refuse a PM changing a media list', async () => {
    const res = await api()
      .post('/api/v1/reference-lists/media_role')
      .set(bearer(await as(world.users.pm)))
      .send({ code: 'drone_pilot', label: label('Drone pilot') });
    expect(res.status).toBe(403);
  });
});
