import type { AccessService } from '../access/service.js';
import { programWhere } from '../access/scope.js';
import { boundedRead } from '../core/bounded-read.js';
import type { PrismaService } from '../core/prisma.service.js';
import {
  bySeries,
  type CardPerson,
  currentSession,
  descriptionOf,
  figuresOf,
  helpedPeople,
  isRunning,
  namedPeople,
  ownWork,
  reachOf,
  type SessionFigures,
  sessionFigures,
  sessionRpms,
  sessionsOf,
  type SeriesViewer,
  volunteerCounts,
} from './project-series.js';

/**
 * The program cards (docs/DECISION_LOG.md, "Programs and projects in one tab, with permanent
 * projects and yearly sessions"): every program the route's scope reaches, with counts and the
 * names of its PM and of the RPMs of its projects' current sessions only. The applications and
 * the volunteers are those of the running sessions. The reads are grouped, a fixed number of them
 * however many programs there are. The caller's own work (reviews waiting, the waitlist) is summed
 * over the current session of each series the caller may open, within what the caller reaches of
 * it, and left out when the caller may open none.
 */
export class ProgramCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async list(viewer: SeriesViewer) {
    return boundedRead(this.prisma, async (tx) => {
      const programs = await tx.program.findMany({
        where: programWhere(viewer.scope),
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          nameBn: true,
          nameEn: true,
          descriptionBn: true,
          descriptionEn: true,
          active: true,
          pmUser: { select: { id: true, displayName: true } },
        },
      });
      const programIds = programs.map((p) => p.id);
      const series = await tx.projectSeries.findMany({
        where: { programId: { in: programIds } },
        select: { id: true, programId: true },
      });
      const all = await sessionsOf(
        tx,
        series.map((s) => s.id),
      );
      // one current session per series, by the one rule
      const sessions = [...bySeries(all).values()].flatMap((list) => currentSession(list) ?? []);
      const sessionIds = sessions.map((s) => s.id);
      const figures = await sessionFigures(
        tx,
        all.map((s) => s.id),
      );
      const people = await helpedPeople(tx, 'program', all, figures);
      const runningSessions = sessions.filter((s) => isRunning(s.status));
      const volunteers = await volunteerCounts(
        tx,
        runningSessions.map((s) => s.id),
        runningSessions.map((s) => s.programId),
      );
      const rpms = await sessionRpms(tx, sessionIds);
      const reach = await reachOf(this.access, tx, viewer.principal, sessions, programIds);
      const work = await ownWork(tx, reach.open, figures);
      const applications = (f: SessionFigures) => f.applications;
      return programs.map((p) => {
        const own = sessions.filter((s) => s.programId === p.id);
        const running = own.filter((s) => isRunning(s.status));
        const opened = own.flatMap((s) => work.get(s.id) ?? []);
        const sum = (list: typeof own, pick: (f: SessionFigures) => number) =>
          list.reduce((total, s) => total + pick(figuresOf(figures, s.id)), 0);
        const named: CardPerson[] = own.flatMap((s) => rpms.get(s.id) ?? []);
        return {
          id: p.id,
          code: p.code,
          name: { bn: p.nameBn, en: p.nameEn },
          description: descriptionOf(p),
          active: p.active,
          pm: p.pmUser ? { id: p.pmUser.id, name: p.pmUser.displayName } : null,
          rpms: namedPeople(named),
          projects: series.filter((s) => s.programId === p.id).length,
          runningProjects: running.length,
          beneficiaries: people.get(p.id) ?? 0,
          applications: sum(running, applications),
          volunteers: volunteers.get(p.id) ?? 0,
          ...(opened.length
            ? {
                todo: {
                  reviewsWaiting: opened.reduce((total, w) => total + w.reviewsWaiting, 0),
                  waitlisted: opened.reduce((total, w) => total + w.waitlisted, 0),
                },
              }
            : {}),
          canCreate: reach.create.has(p.id),
        };
      });
    });
  }
}
