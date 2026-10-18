import { describe, expect, it } from 'vitest';
import { renderTemplateText } from '../i18n/notifications.js';
import { notificationLink } from './links.js';
import {
  inAppParams,
  NOTIFICATION_TEMPLATES,
  PERSON_VARIABLES,
  TEMPLATE_SAMPLES,
  templateVariables,
} from './templates.js';

const UUID = '01900000-0000-7000-8000-000000000001';

describe('the notification templates', () => {
  it('have every channel in bn and en, using only declared variables', () => {
    for (const t of NOTIFICATION_TEMPLATES) {
      for (const [channel, texts] of Object.entries(t.channels)) {
        for (const locale of ['bn', 'en'] as const) {
          const text = texts![locale];
          expect(text?.body, `${t.key} ${channel} ${locale}`).toBeTruthy();
          const used = [text!.subject, text!.title, text!.body].flatMap((s) =>
            s ? templateVariables(s) : [],
          );
          for (const name of used) expect(t.variables, `${t.key}: ${name}`).toContain(name);
        }
      }
    }
  });

  it('never name another person in an in-app text', () => {
    for (const t of NOTIFICATION_TEMPLATES) {
      const inApp = t.channels.in_app;
      if (!inApp) continue;
      for (const locale of ['bn', 'en'] as const) {
        const used = [inApp[locale].title, inApp[locale].body].flatMap((s) =>
          s ? templateVariables(s) : [],
        );
        for (const name of used) expect(PERSON_VARIABLES, `${t.key}: ${name}`).not.toContain(name);
      }
    }
  });

  it('render every template with the samples in both languages, numbers in English digits', () => {
    for (const t of NOTIFICATION_TEMPLATES) {
      for (const texts of Object.values(t.channels)) {
        for (const locale of ['bn', 'en'] as const) {
          const out = renderTemplateText(
            t.key,
            texts![locale],
            t.variables,
            locale,
            TEMPLATE_SAMPLES,
          );
          expect(out.body).not.toMatch(/\{\{/);
          expect(out.body).not.toMatch(/[০-৯]/);
        }
      }
    }
  });

  it('show bilingual values in the reader language and escape only the values', () => {
    const text = { title: '<b>{{project_name}}</b>', body: '{{count}} — {{note}}' };
    const params = {
      project_name: { bn: 'শীত', en: 'Winter' },
      count: 1200,
      note: '<script>x</script>',
    };
    const escape = (v: string) => v.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const en = renderTemplateText('k', text, ['project_name', 'count', 'note'], 'en', params, {
      escape,
    });
    expect(en.title).toBe('<b>Winter</b>');
    expect(en.body).toBe('1,200 — &lt;script&gt;x&lt;/script&gt;');
    const bn = renderTemplateText('k', text, ['project_name', 'count', 'note'], 'bn', params);
    expect(bn.title).toBe('<b>শীত</b>');
  });

  it('see every placeholder shape the renderer fills', () => {
    expect(templateVariables('{{code2}} {{Code}} {{ name }}')).toEqual(['code2', 'Code', 'name']);
  });

  it('keep no person value on an in-app row', () => {
    expect(
      inAppParams({ applicant_name: 'x', from_name: 'y', count: 2, region_name: 'z' }),
    ).toEqual({
      count: 2,
      region_name: 'z',
    });
  });

  it('fail closed on a value that is not text, a number or bilingual data', () => {
    for (const bad of [null, true, {}, { bn: 'x' }, [1], Number.NaN])
      expect(() =>
        renderTemplateText('k', { body: '{{v}}' }, ['v'], 'bn', { v: bad as never }),
      ).toThrow(/v/);
  });

  it('fail closed on an undeclared or a missing variable', () => {
    expect(() =>
      renderTemplateText('k', { body: '{{secret}}' }, [], 'bn', { secret: 'x' }),
    ).toThrow(/secret/);
    expect(() => renderTemplateText('k', { body: '{{count}}' }, ['count'], 'bn', {})).toThrow(
      /count/,
    );
  });
});

describe('the notification links', () => {
  it('are relative routes of the app built only from ids', () => {
    for (const t of NOTIFICATION_TEMPLATES) {
      for (const audience of ['staff', 'volunteer'] as const) {
        const link = notificationLink(t.key, { userId: UUID, projectId: UUID }, audience);
        if (link !== null) expect(link, t.key).toMatch(/^\/(?!\/)[a-z0-9/-]*$/);
      }
    }
  });

  it('send officials and volunteers to their own project pages', () => {
    expect(notificationLink('project_activated', { projectId: UUID }, 'staff')).toBe(
      `/admin/projects/${UUID}`,
    );
    expect(notificationLink('project_activated', { projectId: UUID }, 'volunteer')).toBe(
      `/my-projects/${UUID}`,
    );
  });

  it('never turn a forged id into a path', () => {
    expect(
      notificationLink('project_assignment', { projectId: 'javascript:alert(1)' }, 'volunteer'),
    ).toBe('/my-projects');
    expect(notificationLink('registration_pending', { userId: '//evil.example' }, 'staff')).toBe(
      '/admin/registrations',
    );
    expect(notificationLink('no_such_key', {}, 'staff')).toBeNull();
  });
});
