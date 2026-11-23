import type { DestinationStream, Logger } from 'pino';
import pino from 'pino';
import { assertConditionsCovered } from './access/conditions.js';
import { type AccessRegistry, loadAccessRegistry } from './access/registry.js';
import { AccessService } from './access/service.js';
import { AuditWriter } from './audit/audit-writer.js';
import { OtpDeliveryService, OtpService } from './auth/otp.service.js';
import { PasswordHasher } from './auth/password-hasher.js';
import { PermissionVersionService } from './auth/permission-version.service.js';
import { SESSION_RULES, SessionService } from './auth/session.service.js';
import { TokenService } from './auth/token.service.js';
import type { Env } from './config/env.js';
import { ExportQuestions } from './exports/questions.js';
import { ExportRows } from './exports/rows.js';
import { PdfRenderer } from './exports/pdf/renderer.js';
import { ExportRecords } from './exports/records.js';
import { ExportsService } from './exports/service.js';
import { ExportRunner } from './jobs/export-run.js';
import { ExportSweep } from './jobs/export-sweep.js';
import { ExportEvents } from './notifications/export-events.js';
import { type Clock, systemClock } from './core/clock.js';
import { REDACT_PATHS } from './core/logging.js';
import { PrismaService } from './core/prisma.service.js';
import { HealthService } from './health/service.js';
import { IdempotencyService } from './idempotency/idempotency.service.js';
import { JobRunner } from './jobs/job-runner.js';
import {
  type EmailAdapter,
  InAppAdapter,
  type SmsAdapter,
  SmtpEmailAdapter,
  StubSmsAdapter,
} from './notifications/adapters.js';
import { AuthService } from './services/auth.js';
import { RegistrationCleanup } from './jobs/registration-cleanup.js';
import { LocalKeyCleanup } from './jobs/local-key-cleanup.js';
import { SnapshotService } from './sync/snapshot.js';
import { SyncService } from './sync/sync.service.js';
import { UploadSweep } from './jobs/upload-sweep.js';
import { FileDimensionsJob } from './jobs/file-dimensions.js';
import { StorageStats } from './jobs/storage-stats.js';
import { FileProcessor } from './jobs/file-process.js';
import { createScanner } from './files/scanner.js';
import { AccountEvents } from './notifications/account-events.js';
import { DeliveriesService } from './services/deliveries.js';
import { AttentionService } from './services/attention.js';
import { OwnProfileService } from './services/own-profile.js';
import { ProjectsWorkService } from './services/projects-work.js';
import { InboxService } from './services/inbox.js';
import { NotificationTemplatesService } from './services/notification-templates.js';
import { ProjectEvents } from './notifications/project-events.js';
import { LocationsService } from './services/locations.js';
import { FilesService } from './services/files.js';
import { UploadsService } from './services/uploads.js';
import { VolunteersService } from './services/volunteers.js';
import { VolunteerListService } from './services/volunteer-list.js';
import { VolunteerProfileService } from './services/volunteer-profile.js';
import { BeneficiariesService } from './services/beneficiaries.js';
import { BeneficiaryIdentityService } from './services/beneficiary-identity.js';
import { BeneficiaryMatchService } from './services/beneficiary-match.js';
import { BeneficiaryContactService } from './services/beneficiary-contact.js';
import { BeneficiaryCorrectionsService } from './services/beneficiary-corrections.js';
import { BeneficiaryFamilyService } from './services/beneficiary-family.js';
import { PersonSignals } from './applications/person-signals.js';
import { BeneficiaryFamilyMembersService } from './services/beneficiary-family-members.js';
import { BeneficiaryMergeCandidatesService } from './services/beneficiary-merge-candidates.js';
import { BeneficiaryMergesService } from './services/beneficiary-merges.js';
import { MatchKeysService } from './services/match-keys.js';
import { NameKeysJob } from './jobs/name-keys.js';
import { HelpCountersJob } from './jobs/help-counters.js';
import { NotificationDelivery } from './notifications/delivery.js';
import { NotificationService } from './notifications/service.js';
import { RecipientResolver } from './notifications/recipients.js';
import { AuditLogService } from './services/audit-log.js';
import { ChannelsService } from './services/channels.js';
import { NisabService } from './services/nisab.js';
import { ProjectQuotasService } from './services/project-quotas.js';
import { ScoringService } from './applications/scoring.js';
import { WorkflowSideEffects } from './applications/side-effects.js';
import { TransfersService } from './applications/transfers.js';
import { UnlocksService } from './applications/unlocks.js';
import { MediaReferralsService } from './services/media-referrals.js';
import { MediaWorksService } from './services/media-works.js';
import { MediaHomeService } from './services/media-home.js';
import { WaitlistService } from './applications/waitlist.js';
import { ProgramCardsService } from './services/program-cards.js';
import { CoversService } from './services/covers.js';
import { ProgramsService } from './services/programs.js';
import { ProjectSeriesService } from './services/project-series.js';
import { ReferenceListsService } from './services/reference-lists.js';
import { NameVariantsService } from './services/name-variants.js';
import { SessionMonitorService } from './services/session-monitor.js';
import { SettingsService } from './services/settings.js';
import { SystemHealthService } from './services/system-health.js';
import { ProjectsService } from './services/projects.js';
import { ProjectLifecycleService } from './services/project-lifecycle.js';
import { ProjectRulesService } from './services/project-rules.js';
import { MyProjectsService } from './services/my-projects.js';
import { ProjectVolunteersService } from './services/project-volunteers.js';
import { VolunteerTeamsService } from './services/volunteer-teams.js';
import { TemplatesService } from './services/templates.js';
import { FormLibraryService } from './services/form-library.js';
import { FormsService, readDefinition } from './services/forms.js';
import { ApplicationEvents } from './notifications/application-events.js';
import { MediaEvents } from './notifications/media-events.js';
import { BulkReviewService } from './applications/bulk.js';
import { ApplicationsService } from './applications/service.js';
import { SubmissionWriter } from './applications/submission.js';
import { WorkflowEngine } from './workflow/engine.js';
import { assertWorkflowNamesKnown } from './workflow/registry.js';
import { mergedWorkflowDefinitions } from './workflow/templates.js';
import { ReadyFormsService } from './services/ready-forms.js';
import { PublicFormsService } from './services/public-forms.js';
import { PublicLinkService } from './services/public-link.js';
import { PublicPhotosService } from './services/public-photos.js';
import { ProjectSetupService } from './services/project-setup.js';
import { RegistrationsService } from './services/registrations.js';
import { ChangeRequestsService } from './services/change-requests.js';
import { StaffChangeRequestsService } from './services/staff-change-requests.js';
import { BlocklistService } from './services/blocklist.js';
import { HandoverService } from './services/handover.js';
import { RegistrationService } from './services/registration.js';
import { RegistrationPhotosService } from './services/registration-photos.js';
import { SessionsService } from './services/sessions.js';
import { AccessPanelService } from './services/access.js';
import { ExtraAreasService } from './services/extra-areas.js';
import { RoleChangesService } from './services/role-changes.js';
import { OrganogramService } from './services/organogram.js';
import { StaffAccountsService } from './services/staff-accounts.js';
import { UsersService } from './services/users.js';
import { createDriver, createStorage, type StorageDriver } from './storage/index.js';

/**
 * The services of one process, built once from the validated configuration (no DI container): the
 * api, the worker and the tests construct the same objects; tests pass overrides.
 */
export interface Container {
  env: Env;
  logger: Logger;
  clock: Clock;
  prisma: PrismaService;
  audit: AuditWriter;
  idempotency: IdempotencyService;
  storage: StorageDriver;
  email: EmailAdapter;
  sms: SmsAdapter;
  inApp: InAppAdapter;
  jobs: JobRunner;
  health: HealthService;
  accessRegistry: AccessRegistry;
  hasher: PasswordHasher;
  tokens: TokenService;
  sessions: SessionService;
  access: AccessService;
  permissionVersions: PermissionVersionService;
  otpDelivery: OtpDeliveryService;
  otp: OtpService;
  auth: AuthService;
  deviceSessions: SessionsService;
  users: UsersService;
  roleChanges: RoleChangesService;
  extraAreas: ExtraAreasService;
  ownProfile: OwnProfileService;
  projectsWork: ProjectsWorkService;
  staffAccounts: StaffAccountsService;
  organogram: OrganogramService;
  accessPanel: AccessPanelService;
  locations: LocationsService;
  accountEvents: AccountEvents;
  projectEvents: ProjectEvents;
  registration: RegistrationService;
  registrationCleanup: RegistrationCleanup;
  uploadSweep: UploadSweep;
  localKeyCleanup: LocalKeyCleanup;
  storageStats: StorageStats;
  fileDimensions: FileDimensionsJob;
  fileProcessor: FileProcessor;
  uploads: UploadsService;
  registrationPhotos: RegistrationPhotosService;
  files: FilesService;
  volunteers: VolunteersService;
  volunteerList: VolunteerListService;
  volunteerProfile: VolunteerProfileService;
  beneficiaries: BeneficiariesService;
  beneficiaryIdentity: BeneficiaryIdentityService;
  beneficiaryMatch: BeneficiaryMatchService;
  beneficiaryContact: BeneficiaryContactService;
  beneficiaryCorrections: BeneficiaryCorrectionsService;
  beneficiaryFamily: BeneficiaryFamilyService;
  beneficiaryMergeCandidates: BeneficiaryMergeCandidatesService;
  beneficiaryMerges: BeneficiaryMergesService;
  matchKeys: MatchKeysService;
  nameKeys: NameKeysJob;
  helpCounters: HelpCountersJob;
  programs: ProgramsService;
  programCards: ProgramCardsService;
  covers: CoversService;
  projectSeries: ProjectSeriesService;
  settings: SettingsService;
  referenceLists: ReferenceListsService;
  nameVariants: NameVariantsService;
  formLibrary: FormLibraryService;
  forms: FormsService;
  workflow: WorkflowEngine;
  scoring: ScoringService;
  applications: ApplicationsService;
  exportRows: ExportRows;
  exportQuestions: ExportQuestions;
  pdf: PdfRenderer;
  exports: ExportsService;
  exportRecords: ExportRecords;
  exportRunner: ExportRunner;
  exportEvents: ExportEvents;
  exportSweep: ExportSweep;
  bulkReview: BulkReviewService;
  waitlist: WaitlistService;
  unlocks: UnlocksService;
  mediaReferrals: MediaReferralsService;
  mediaWorks: MediaWorksService;
  mediaHome: MediaHomeService;
  mediaEvents: MediaEvents;
  transfers: TransfersService;
  applicationEvents: ApplicationEvents;
  readyForms: ReadyFormsService;
  publicLink: PublicLinkService;
  publicPhotos: PublicPhotosService;
  publicForms: PublicFormsService;
  nisab: NisabService;
  auditLog: AuditLogService;
  inbox: InboxService;
  attention: AttentionService;
  notificationTemplates: NotificationTemplatesService;
  deliveries: DeliveriesService;
  sessionMonitor: SessionMonitorService;
  channels: ChannelsService;
  notifications: NotificationService;
  delivery: NotificationDelivery;
  systemHealth: SystemHealthService;
  projects: ProjectsService;
  projectSetup: ProjectSetupService;
  projectQuotas: ProjectQuotasService;
  projectLifecycle: ProjectLifecycleService;
  projectRules: ProjectRulesService;
  myProjects: MyProjectsService;
  snapshot: SnapshotService;
  sync: SyncService;
  projectVolunteers: ProjectVolunteersService;
  volunteerTeams: VolunteerTeamsService;
  templates: TemplatesService;
  registrations: RegistrationsService;
  changeRequests: ChangeRequestsService;
  staffChangeRequests: StaffChangeRequestsService;
  blocklist: BlocklistService;
  handover: HandoverService;
}

export interface ContainerOptions {
  /** Test hook: where log lines go (default stdout). */
  logStream?: DestinationStream;
  /** Test hook: replace services (a fake Prisma for the readiness test, a fixed clock). */
  overrides?: Partial<Container>;
}

export function createLogger(env: Env, stream?: DestinationStream): Logger {
  return pino(
    { level: env.LOG_LEVEL, redact: { paths: REDACT_PATHS, censor: '[redacted]' } },
    stream,
  );
}

export function createContainer(env: Env, options: ContainerOptions = {}): Container {
  const o = options.overrides ?? {};
  const logger = o.logger ?? createLogger(env, options.logStream);
  const clock = o.clock ?? systemClock;
  const prisma = o.prisma ?? new PrismaService(env);
  const idempotency = o.idempotency ?? new IdempotencyService(prisma);
  const storage = o.storage ?? createStorage(env);
  const jobs = o.jobs ?? new JobRunner(env, logger);
  const health =
    o.health ??
    new HealthService(
      {
        database: async () => {
          await prisma.$queryRaw`SELECT 1`;
          return true;
        },
        storage: () => storage.ping(),
        queue: () => jobs.ping(),
      },
      logger,
    );
  const audit = o.audit ?? new AuditWriter();
  const email =
    o.email ??
    new SmtpEmailAdapter({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.SMTP_FROM,
    });
  const sms = o.sms ?? new StubSmsAdapter(env.SMS_MODE, logger);
  // Authentication (docs/architecture/AUTH.md): built in dependency order, so each service gets its instances.
  const hasher = o.hasher ?? new PasswordHasher();
  const tokens = o.tokens ?? new TokenService(env, clock);
  // permissions.yaml must name only conditions the access module can check (docs/security/RBAC.md,
  // "permissions.yaml schema and loading").
  const accessRegistry = o.accessRegistry ?? loadAccessRegistry(env.PERMISSIONS_FILE);
  assertConditionsCovered(accessRegistry);
  // the workflow templates may name only guards, effects and permissions that exist
  assertWorkflowNamesKnown(mergedWorkflowDefinitions(), accessRegistry.isKnownPermission);
  const access = o.access ?? new AccessService(accessRegistry, prisma, clock, logger);
  const notifications =
    o.notifications ??
    new NotificationService(new RecipientResolver(access, accessRegistry, clock), jobs, clock);
  const accountEvents = o.accountEvents ?? new AccountEvents(notifications, logger);
  const projectEvents = o.projectEvents ?? new ProjectEvents(notifications);
  const applicationEvents = o.applicationEvents ?? new ApplicationEvents(notifications, clock);
  // the E2E run signs in with the same few demo accounts in parallel
  const deviceLimit = SESSION_RULES.deviceLimit * (env.SESSION_DEVICE_LIMIT_RELAXED ? 100 : 1);
  const sessions =
    o.sessions ??
    new SessionService(prisma, tokens, audit, clock, accountEvents, deviceLimit, [
      env.LOCAL_KEY_SECRET,
      ...(env.LOCAL_KEY_PREVIOUS_SECRET ? [env.LOCAL_KEY_PREVIOUS_SECRET] : []),
    ]);
  const permissionVersions = o.permissionVersions ?? new PermissionVersionService(audit, sessions);
  const otpDelivery = o.otpDelivery ?? new OtpDeliveryService(env, sms, email, logger);
  const otp = o.otp ?? new OtpService(env, prisma, clock, otpDelivery);
  const auth =
    o.auth ??
    new AuthService(
      env,
      prisma,
      clock,
      hasher,
      tokens,
      sessions,
      otp,
      audit,
      logger,
      accountEvents,
    );
  const users =
    o.users ?? new UsersService(env, prisma, audit, sessions, permissionVersions, clock, access);
  const projects = o.projects ?? new ProjectsService(env, prisma, audit, access, clock);
  const referenceLists = o.referenceLists ?? new ReferenceListsService(prisma, audit);
  const formLibrary =
    o.formLibrary ?? new FormLibraryService(prisma, referenceLists, readDefinition);
  const forms = o.forms ?? new FormsService(prisma, audit, access, projects, formLibrary);
  const nisab = o.nisab ?? new NisabService(prisma, audit, clock);
  const scoring = o.scoring ?? new ScoringService(clock, nisab);
  const workflow =
    o.workflow ??
    new WorkflowEngine(
      access,
      audit,
      clock,
      applicationEvents,
      new WorkflowSideEffects(scoring, clock),
    );
  const settings = o.settings ?? new SettingsService(prisma, audit);
  const registration =
    o.registration ??
    new RegistrationService(env, prisma, clock, otp, audit, accountEvents, hasher);
  const beneficiaryMergeCandidates =
    o.beneficiaryMergeCandidates ??
    new BeneficiaryMergeCandidatesService(env, prisma, access, audit);
  const beneficiaryFamily = o.beneficiaryFamily ?? new BeneficiaryFamilyService();
  // the stored name keys of every write of a name or a village, and the job that repairs them
  const matchKeys = o.matchKeys ?? new MatchKeysService();
  const beneficiaryIdentity =
    o.beneficiaryIdentity ??
    new BeneficiaryIdentityService(
      prisma,
      access,
      audit,
      clock,
      beneficiaryMergeCandidates,
      matchKeys,
    );
  const beneficiaryMatch =
    o.beneficiaryMatch ??
    new BeneficiaryMatchService(env, prisma, access, audit, clock, settings, matchKeys);
  const beneficiaryContact =
    o.beneficiaryContact ??
    new BeneficiaryContactService(
      prisma,
      access,
      audit,
      beneficiaryIdentity,
      beneficiaryMergeCandidates,
      matchKeys,
    );
  // the field unlock of approved applications; the record lists its waiting steps
  const unlocks =
    o.unlocks ??
    new UnlocksService(prisma, access, audit, clock, nisab, beneficiaryContact, applicationEvents);
  // the Media Team's referrals; the application's record shows its media state
  const mediaEvents = o.mediaEvents ?? new MediaEvents(notifications);
  const mediaReferrals =
    o.mediaReferrals ?? new MediaReferralsService(env, prisma, access, audit, clock, mediaEvents);
  const mediaWorks =
    o.mediaWorks ??
    new MediaWorksService(prisma, access, audit, clock, mediaEvents, mediaReferrals);
  const publicPhotos =
    o.publicPhotos ?? new PublicPhotosService(prisma, storage, audit, jobs, logger, clock);
  const locations = o.locations ?? new LocationsService(prisma);
  const myProjects = o.myProjects ?? new MyProjectsService(prisma, audit, clock, projectEvents);
  const applications =
    o.applications ??
    new ApplicationsService(
      prisma,
      env,
      clock,
      access,
      audit,
      beneficiaryIdentity,
      beneficiaryFamily,
      nisab,
      workflow,
      new SubmissionWriter(
        access,
        beneficiaryIdentity,
        beneficiaryContact,
        audit,
        new BeneficiaryFamilyMembersService(audit, matchKeys),
      ),
      scoring,
      unlocks,
      mediaReferrals,
      new PersonSignals(access, beneficiaryFamily, beneficiaryMergeCandidates),
      beneficiaryMatch,
    );
  const built = {
    env,
    logger,
    clock,
    prisma,
    audit,
    idempotency,
    storage,
    email,
    sms,
    inApp: o.inApp ?? new InAppAdapter(),
    jobs,
    health,
    accessRegistry,
    hasher,
    tokens,
    sessions,
    access,
    permissionVersions,
    otpDelivery,
    otp,
    auth,
    deviceSessions:
      o.deviceSessions ?? new SessionsService(sessions, prisma, audit, access, accountEvents),
    users,
    roleChanges:
      o.roleChanges ??
      new RoleChangesService(
        prisma,
        clock,
        audit,
        access,
        permissionVersions,
        accountEvents,
        users,
        auth,
      ),
    extraAreas:
      o.extraAreas ??
      new ExtraAreasService(prisma, clock, audit, access, permissionVersions, accountEvents),
    ownProfile: o.ownProfile ?? new OwnProfileService(prisma),
    projectsWork: o.projectsWork ?? new ProjectsWorkService(prisma, access),
    staffAccounts:
      o.staffAccounts ??
      new StaffAccountsService(
        env,
        prisma,
        clock,
        audit,
        access,
        accessRegistry,
        hasher,
        email,
        logger,
        settings,
      ),
    organogram: o.organogram ?? new OrganogramService(prisma, access),
    accessPanel:
      o.accessPanel ??
      new AccessPanelService(
        prisma,
        access,
        audit,
        permissionVersions,
        clock,
        accountEvents,
        projectEvents,
      ),
    locations,
    accountEvents,
    projectEvents,
    registration,
    registrationPhotos:
      o.registrationPhotos ??
      new RegistrationPhotosService(
        prisma,
        storage,
        audit,
        registration,
        logger,
        accountEvents,
        jobs,
      ),
    files: o.files ?? new FilesService(env, prisma, storage, access, audit),
    uploads: o.uploads ?? new UploadsService(prisma, storage, audit, access, jobs, clock, logger),
    volunteers: o.volunteers ?? new VolunteersService(prisma),
    volunteerList: o.volunteerList ?? new VolunteerListService(env, prisma, access),
    volunteerProfile: o.volunteerProfile ?? new VolunteerProfileService(prisma, access),
    beneficiaries:
      o.beneficiaries ?? new BeneficiariesService(env, prisma, clock, access, beneficiaryIdentity),
    beneficiaryIdentity,
    beneficiaryMatch,
    beneficiaryContact,
    beneficiaryFamily,
    beneficiaryMergeCandidates,
    beneficiaryMerges:
      o.beneficiaryMerges ??
      new BeneficiaryMergesService(
        prisma,
        access,
        audit,
        clock,
        beneficiaryMergeCandidates,
        matchKeys,
        env,
      ),
    beneficiaryCorrections:
      o.beneficiaryCorrections ??
      new BeneficiaryCorrectionsService(
        prisma,
        access,
        audit,
        beneficiaryIdentity,
        beneficiaryMergeCandidates,
        matchKeys,
      ),
    matchKeys,
    nameKeys: o.nameKeys ?? new NameKeysJob(prisma, matchKeys, logger, { jobs }),
    helpCounters: o.helpCounters ?? new HelpCountersJob(prisma, logger),
    programs: o.programs ?? new ProgramsService(prisma, audit),
    programCards: o.programCards ?? new ProgramCardsService(prisma, access),
    covers: o.covers ?? new CoversService(env, prisma, audit, access),
    projectSeries:
      o.projectSeries ??
      new ProjectSeriesService(prisma, audit, access, projects, clock, idempotency),
    settings,
    referenceLists,
    nameVariants: o.nameVariants ?? new NameVariantsService(prisma, audit, jobs),
    formLibrary,
    forms,
    workflow,
    scoring,
    applicationEvents,
    applications,
    bulkReview:
      o.bulkReview ?? new BulkReviewService(prisma, access, audit, idempotency, workflow, logger),
    waitlist: o.waitlist ?? new WaitlistService(prisma, access, idempotency, workflow),
    unlocks,
    mediaEvents,
    mediaReferrals,
    mediaWorks,
    mediaHome: o.mediaHome ?? new MediaHomeService(env, prisma, access),
    readyForms: o.readyForms ?? new ReadyFormsService(prisma, audit, projects, forms),
    publicLink: o.publicLink ?? new PublicLinkService(env, prisma, audit, projects, forms),
    publicPhotos,
    publicForms:
      o.publicForms ??
      new PublicFormsService(prisma, audit, clock, nisab, beneficiaryIdentity, publicPhotos),
    nisab,
    auditLog: o.auditLog ?? new AuditLogService(env, prisma, clock),
    inbox: o.inbox ?? new InboxService(env, prisma, clock, logger),
    notificationTemplates:
      o.notificationTemplates ?? new NotificationTemplatesService(prisma, audit),
    deliveries: o.deliveries ?? new DeliveriesService(env, prisma),
    sessionMonitor: o.sessionMonitor ?? new SessionMonitorService(env, prisma, clock),
    channels: o.channels ?? new ChannelsService(env, settings),
    notifications,
    delivery:
      o.delivery ??
      new NotificationDelivery(
        prisma,
        email,
        sms,
        jobs,
        notifications,
        clock,
        logger,
        env.EMAIL_PER_MINUTE,
      ),
    systemHealth: o.systemHealth ?? new SystemHealthService(env, prisma, health, clock),
    projects,
    projectSetup:
      o.projectSetup ??
      new ProjectSetupService(prisma, audit, access, projects, permissionVersions),
    projectQuotas: o.projectQuotas ?? new ProjectQuotasService(prisma, audit, access, projects),
    projectLifecycle:
      o.projectLifecycle ??
      new ProjectLifecycleService(prisma, audit, projects, clock, projectEvents),
    projectRules: o.projectRules ?? new ProjectRulesService(prisma, audit, access, projects),
    myProjects,
    snapshot:
      o.snapshot ?? new SnapshotService(prisma, access, myProjects, applications, locations),
    sync:
      o.sync ??
      new SyncService(
        prisma,
        access,
        applications,
        unlocks,
        sessions,
        idempotency,
        audit,
        clock,
        logger,
      ),
    projectVolunteers:
      o.projectVolunteers ??
      new ProjectVolunteersService(env, prisma, audit, access, projects, clock, projectEvents),
    volunteerTeams:
      o.volunteerTeams ?? new VolunteerTeamsService(prisma, audit, access, clock, projectEvents),
    templates: o.templates ?? new TemplatesService(prisma, audit, access),
    registrations:
      o.registrations ??
      new RegistrationsService(
        env,
        prisma,
        clock,
        audit,
        access,
        accessRegistry,
        permissionVersions,
        sessions,
        accountEvents,
      ),
    handover:
      o.handover ??
      new HandoverService(prisma, clock, audit, access, permissionVersions, accountEvents),
    blocklist:
      o.blocklist ?? new BlocklistService(prisma, clock, audit, access, sessions, accountEvents),
    changeRequests:
      o.changeRequests ??
      new ChangeRequestsService(
        env,
        prisma,
        clock,
        audit,
        otp,
        access,
        permissionVersions,
        sessions,
        accountEvents,
        idempotency,
      ),
    staffChangeRequests:
      o.staffChangeRequests ??
      new StaffChangeRequestsService(
        env,
        prisma,
        clock,
        audit,
        permissionVersions,
        sessions,
        accountEvents,
        idempotency,
      ),
    registrationCleanup: o.registrationCleanup ?? new RegistrationCleanup(prisma, storage, logger),
    uploadSweep: o.uploadSweep ?? new UploadSweep(prisma, storage, logger),
    localKeyCleanup: o.localKeyCleanup ?? new LocalKeyCleanup(prisma, clock, logger),
    storageStats: o.storageStats ?? new StorageStats(prisma, clock, logger),
    // a row names its driver: the current one, or the other while the files are being moved
    fileDimensions:
      o.fileDimensions ??
      new FileDimensionsJob(
        prisma,
        (name) => (name === storage.name ? storage : createDriver(name, env)),
        logger,
      ),
    fileProcessor:
      o.fileProcessor ?? new FileProcessor(prisma, storage, createScanner(env), logger),
  };
  // an export reads exactly the rows its list shows, through the lists' own filters
  const exportRows =
    o.exportRows ??
    new ExportRows(prisma, clock, access, built.volunteerList, built.beneficiaries, applications);
  const exportQuestions = o.exportQuestions ?? new ExportQuestions(prisma);
  // one browser per process, started on the first PDF
  const pdf = o.pdf ?? new PdfRenderer({ logger });
  // a record's PDF reads the record through the same services as its page
  const exportRecords =
    o.exportRecords ??
    new ExportRecords(prisma, access, exportRows, built.beneficiaries, applications);
  const exportEvents = o.exportEvents ?? new ExportEvents(notifications);
  return {
    ...built,
    // the transfer assigns the new volunteer through the assignments above
    transfers:
      o.transfers ??
      new TransfersService(
        prisma,
        access,
        audit,
        clock,
        idempotency,
        applicationEvents,
        built.projectVolunteers,
      ),
    // the My Work home's attention list reads the services above
    attention:
      o.attention ??
      new AttentionService(
        prisma,
        access,
        clock,
        built.inbox,
        built.myProjects,
        built.registrations,
        built.changeRequests,
        built.projects,
        built.unlocks,
      ),
    exportRows,
    exportQuestions,
    pdf,
    exportRecords,
    exports:
      o.exports ??
      new ExportsService(prisma, audit, jobs, clock, exportRows, exportQuestions, exportRecords),
    exportEvents,
    exportRunner:
      o.exportRunner ??
      new ExportRunner(prisma, storage, clock, exportRows, exportQuestions, pdf, {
        logger,
        events: exportEvents,
      }),
    exportSweep: o.exportSweep ?? new ExportSweep(prisma, storage, clock, logger, exportEvents),
  };
}

/** Closes what the container opened (Prisma, pg-boss); used by server.ts and the tests. */
export async function closeContainer(c: Container): Promise<void> {
  try {
    await c.jobs.stop();
    // a browser that will not close never keeps the database connections open
    await c.pdf.close().catch((error: unknown) => c.logger.error({ err: error }, 'pdf browser'));
  } finally {
    await c.prisma.$disconnect();
  }
}
