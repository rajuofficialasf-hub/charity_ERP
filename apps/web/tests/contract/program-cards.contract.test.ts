import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  programCardSchema,
  projectPageSchema,
  projectSeriesCardSchema,
  projectSeriesSchema,
  sessionSummarySchema,
} from '../../src/api/schemas';
import { expectContract } from './support/expect';
import { call, contractBase, signIn } from './support/session';
import { HEAD, PM_HUM, RPM_DHAKA } from './support/world';

// The reads of the programs and projects tab: the program cards, the project series of a program
// and of all, one series with its sessions, the list of the sessions with their labels and the
// counts of one session, as the Department Head, a PM and an RPM read them.
describe.skipIf(!contractBase())('the programs and projects tab', () => {
  it('reads the program cards and the series cards as every role of the tab sees them', async () => {
    for (const who of [HEAD, PM_HUM, RPM_DHAKA]) {
      const caller = await signIn(who);
      const programs = expectContract(
        await call(caller, 'GET', '/program-cards'),
        200,
        z.array(programCardSchema),
      );
      expect(programs.map((p) => p.code)).toEqual(expect.arrayContaining(['HUM', 'UCD', 'ERR']));
      const hum = programs.find((p) => p.code === 'HUM')!;
      const series = expectContract(
        await call(caller, 'GET', `/project-series?programId=${hum.id}`),
        200,
        z.array(projectSeriesCardSchema),
      );
      expect(series.every((s) => s.programId === hum.id)).toBe(true);
      expectContract(
        await call(caller, 'GET', '/project-series'),
        200,
        z.array(projectSeriesCardSchema),
      );
      const [first] = series;
      if (first)
        expect(
          expectContract(
            await call(caller, 'GET', `/project-series/${first.id}`),
            200,
            projectSeriesSchema,
          ).id,
        ).toBe(first.id);
    }
  });

  it('reads the list of the sessions with their labels, by project', async () => {
    const pm = await signIn(PM_HUM);
    const [series] = expectContract(
      await call(pm, 'GET', '/project-series'),
      200,
      z.array(projectSeriesCardSchema),
    );
    expect(series, 'a project series of the demo seed').toBeDefined();
    const page = expectContract(
      await call(pm, 'GET', `/projects?seriesId=${series!.id}&include=total`),
      200,
      projectPageSchema.shape.data,
    );
    expect(page.every((p) => p.seriesId === series!.id && p.sessionLabel.length > 0)).toBe(true);
  });

  it('reads the whole counts of a session, the same for the Head, a PM and an RPM', async () => {
    const pm = await signIn(PM_HUM);
    const [series] = expectContract(
      await call(pm, 'GET', '/project-series'),
      200,
      z.array(projectSeriesCardSchema),
    );
    const sessionId = series?.current?.id;
    expect(sessionId, 'a session of the demo seed').toBeDefined();
    const counts = [];
    for (const who of [HEAD, PM_HUM, RPM_DHAKA])
      counts.push(
        expectContract(
          await call(await signIn(who), 'GET', `/projects/${sessionId}/summary`),
          200,
          sessionSummarySchema,
        ),
      );
    expect(counts[1]).toEqual(counts[0]);
    expect(counts[2]).toEqual(counts[0]);
  });
});
