import {
  Alert,
  AttentionCard,
  BulkList,
  BulkRow,
  Button,
  Card,
  CheckboxGroup,
  ChoiceTiles,
  ColorModeButton,
  Combobox,
  ConfirmDialog,
  Chip,
  ContactList,
  DataTable,
  DateField,
  DescriptionList,
  Dialog,
  Disclosure,
  Drawer,
  EmptyState,
  ErrorSummary,
  FileUpload,
  FilterBar,
  FlipCard,
  FormSection,
  IconButton,
  IconTile,
  LinkButton,
  Menu,
  OfflineBanner,
  Page,
  PersonCell,
  ProfileBanner,
  RecordHeader,
  LinkTabs,
  ProfileSection,
  ProgressBar,
  RadioGroup,
  SegmentedControl,
  SelectField,
  Skeleton,
  StatCard,
  StatFilterBar,
  StatusChip,
  Stepper,
  SummaryBanner,
  Switch,
  Tabs,
  TextField,
  Timeline,
  type StatusKey,
  PhotoViewer,
  tokens,
} from '@/ui';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { CoverArt } from '../components/CoverArt';
import { LanguageSwitch } from '../components/LanguageSwitch';

const STATUSES: StatusKey[] = [
  'draft',
  'needs_verification',
  'submitted',
  'under_review',
  'reviewed',
  'waitlisted',
  'approved',
  'rejected',
  'implementation',
  'completed',
  'closed',
  'sync_pending',
  'sync_syncing',
  'sync_synced',
  'sync_failed',
  'photo_verified',
  'photo_flagged',
  'photo_pending',
  'blocklisted',
];

/** One piece of the gallery: a titled card the E2E finds by its test id for its screenshot. */
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      data-testid={`piece-${id}`}
      aria-labelledby={`piece-${id}`}
      className="asf-gallery-section"
    >
      <h2 id={`piece-${id}`} className="asf-gallery-title">
        {title}
      </h2>
      <div className="asf-gallery-body">{children}</div>
    </section>
  );
}

interface Row {
  id: string;
  name: string;
  village: string;
  score: number;
  status: StatusKey;
}

/** A drawn photo in the theme's colours, for the gallery's photo viewer. */
const drawn = (sky: string, sun: string, hill: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="${sky}"/><circle cx="600" cy="150" r="70" fill="${sun}"/><path d="M0 430 Q200 330 400 420 T800 390 V600 H0Z" fill="${hill}"/></svg>`,
  )}`;
const { colors } = tokens;
const SAMPLE_PHOTOS = [
  {
    id: 'one',
    alt: 'overlay.photoAlt1',
    src: drawn(colors.info.lighter, colors.warning.light, colors.primary.main),
  },
  {
    id: 'two',
    alt: 'overlay.photoAlt2',
    src: drawn(colors.neutral['300'], colors.warning.main, colors.primary.dark),
  },
  {
    id: 'three',
    alt: 'overlay.photoAlt3',
    src: drawn(colors.primary.lighter, colors.warning.lighter, colors.success.dark),
  },
] as const;

/**
 * The asf pieces built for the app, each in a section, for a look in both languages and both
 * modes and for the axe check of the gallery spec. Development and the E2E build only.
 */
export function AsfGallery() {
  const t = useTranslations('gallery');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chip, setChip] = useState('all');
  const [items, setItems] = useState<string[]>(['blanket']);
  const [other, setOther] = useState('');
  const [gender, setGender] = useState<string | null>('female');
  const [notices, setNotices] = useState(true);
  const [start, setStart] = useState<string | null>('blank');
  const [district, setDistrict] = useState('');
  const [union, setUnion] = useState<string | null>(null);
  const [money, setMoney] = useState('1250');
  const [open, setOpen] = useState<'dialog' | 'confirm' | 'drawer' | 'photos' | null>(null);
  const [photo, setPhoto] = useState(0);

  const rows: Row[] = [
    {
      id: '1',
      name: t('sample.rahima'),
      village: t('sample.char_bagdanga'),
      score: 82,
      status: 'approved',
    },
    {
      id: '2',
      name: t('sample.karim'),
      village: t('sample.purba_para'),
      score: 64,
      status: 'under_review',
    },
    {
      id: '3',
      name: t('sample.ayesha'),
      village: t('sample.char_bagdanga'),
      score: 51,
      status: 'waitlisted',
    },
  ];
  const districts = (['dhaka', 'gazipur', 'rangpur', 'dinajpur'] as const).map((key) => ({
    value: key,
    label: t(`district.${key}`),
  }));

  return (
    <div className="asf-gallery">
      <Page
        eyebrow={t('asf.eyebrow')}
        title={t('asf.title')}
        description={t('asf.intro')}
        documentTitle={false}
        actions={
          <>
            <LanguageSwitch />
            <ColorModeButton />
          </>
        }
      >
        <Section id="buttons" title={t('asf.sections.buttons')}>
          <div className="asf-gallery-row">
            <Button>{t('button.primary')}</Button>
            <Button variant="secondary">{t('button.secondary')}</Button>
            <Button variant="text">{t('button.ghost')}</Button>
            <Button variant="danger">{t('button.danger')}</Button>
            <Button size="small" variant="secondary">
              {t('button.small')}
            </Button>
            <Button loading>{t('button.loading')}</Button>
            <Button disabled>{t('button.disabled')}</Button>
            <IconButton label={t('button.icon')} icon="add" />
          </div>
        </Section>

        <Section id="states" title={t('asf.sections.states')}>
          <div className="asf-gallery-row">
            {STATUSES.map((status) => (
              <StatusChip key={status} status={status} label={t(`status.${status}`)} />
            ))}
          </div>
          <StatFilterBar
            label={t('table.label')}
            items={[
              { id: 'all', label: t('table.chipAll'), value: 1240, icon: 'users' },
              {
                id: 'remaining',
                label: t('table.chipRemaining'),
                value: 12,
                icon: 'hourglass',
                tone: 'warning',
              },
              {
                id: 'done',
                label: t('table.chipDone'),
                value: 300,
                icon: 'success',
                tone: 'success',
              },
            ]}
            selectedId={chip}
            onSelect={setChip}
            moreLabel={t('nav.more')}
            moreValue={(hidden) => String(hidden)}
          />
        </Section>

        <Section id="fields" title={t('asf.sections.fields')}>
          <ErrorSummary
            errors={[{ fieldId: 'gallery-mobile', message: t('field.mobileError') }]}
            focusKey="gallery"
          />
          <FormSection title={t('field.name')} description={t('field.nameHelper')}>
            <TextField
              label={t('field.nid')}
              type="nid"
              value="1990123456789"
              onChange={() => {}}
              hint={t('field.nidHelper')}
            />
            <TextField
              label={t('field.father')}
              value={t('field.fatherValue')}
              onChange={() => {}}
              locked
              onRequestCorrection={() => {}}
              previousValue={t('field.fatherOld')}
            />
            <TextField label={t('field.income')} type="money" value={money} onChange={setMoney} />
            <TextField
              id="gallery-mobile"
              label={t('field.mobile')}
              type="tel"
              value="01711000000"
              onChange={() => {}}
              error={t('field.mobileError')}
            />
            <TextField
              label={t('field.official')}
              value=""
              onChange={() => {}}
              officialOnly
              rows={3}
            />
          </FormSection>
        </Section>

        <Section id="choices" title={t('asf.sections.choices')}>
          <CheckboxGroup
            label={t('choice.items')}
            options={(['blanket', 'shawl', 'sweater', 'other'] as const).map((key) => ({
              value: key,
              label: t(`choice.itemOptions.${key}`),
            }))}
            value={items}
            onChange={setItems}
            columns={2}
            other={{ value: 'other', text: other, onTextChange: setOther }}
          />
          <RadioGroup
            label={t('choice.gender')}
            orientation="horizontal"
            options={(['female', 'male'] as const).map((key) => ({
              value: key,
              label: t(`choice.genderOptions.${key}`),
            }))}
            value={gender}
            onChange={setGender}
          />
          <Switch label={t('row.notifications')} checked={notices} onChange={setNotices} />
          <SelectField
            label={t('table.village')}
            options={districts}
            value={district}
            onChange={setDistrict}
            placeholder={t('table.chipAll')}
          />
          <Combobox
            label={t('table.village')}
            options={districts}
            value={union}
            onChange={setUnion}
          />
          <ChoiceTiles
            label={t('asf.sections.choices')}
            value={start}
            onChange={setStart}
            tiles={[
              {
                id: 'blank',
                title: t('asf.tiles.blank'),
                description: t('asf.tiles.blankText'),
                icon: 'add',
              },
              {
                id: 'copy',
                title: t('asf.tiles.copy'),
                description: t('asf.tiles.copyText'),
                icon: 'copy',
              },
            ]}
          />
        </Section>

        <Section id="table" title={t('asf.sections.table')}>
          <DataTable<Row>
            label={t('table.label')}
            title={t('table.label')}
            rows={rows}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.name}
            columns={[
              {
                id: 'name',
                header: t('table.name'),
                cell: (row) => <PersonCell name={row.name} secondary={row.village} />,
                isRowHeader: true,
                sortable: true,
              },
              {
                id: 'score',
                header: t('table.score'),
                cell: (row) => row.score,
                numeric: true,
                priority: 2,
              },
              {
                id: 'status',
                header: t('table.status'),
                cell: (row) => <StatusChip status={row.status} label={t(`status.${row.status}`)} />,
              },
            ]}
            cardRenderer={(row) => (
              <PersonCell name={row.name} secondary={`${row.village} · ${row.score}`} />
            )}
            selectionMode="multiple"
            selectedIds={selected}
            onSelectionChange={setSelected}
            bulkActions={<Button size="small">{t('button.primary')}</Button>}
            sort={{ columnId: 'name', direction: 'asc' }}
            onSortChange={() => {}}
            rowActions={() => (
              <Button size="small" variant="text">
                {t('table.view')}
              </Button>
            )}
            toolbar={
              <FilterBar
                onSearch={() => {}}
                searchPlaceholder={t('table.name')}
                chips={[
                  { id: 'all', label: t('table.chipAll'), count: 3 },
                  { id: 'remaining', label: t('table.chipRemaining'), count: 1 },
                ]}
                activeChip={chip}
                onChipChange={setChip}
              />
            }
            pagination={{
              page: 1,
              pageSize: 3,
              total: 9,
              onPageChange: () => {},
              showPageNumbers: true,
            }}
          />
        </Section>

        <Section id="progress" title={t('asf.sections.progress')}>
          <Stepper
            label={t('timeline.stagesLabel')}
            steps={[
              t('timeline.stages.foundation'),
              t('timeline.stages.walls'),
              t('timeline.stages.roof'),
              t('timeline.stages.handover'),
            ]}
            current={1}
          />
          <Timeline
            label={t('timeline.label')}
            showActor
            steps={[
              {
                id: 's',
                title: t('timeline.submitted'),
                actor: t('timeline.actor1'),
                time: '01-11-2026 10:00',
                status: 'done',
              },
              {
                id: 'r',
                title: t('timeline.review'),
                actor: t('timeline.actor2'),
                time: '02-11-2026 09:30',
                status: 'current',
                comment: t('timeline.comment'),
              },
              { id: 'a', title: t('timeline.approval'), status: 'upcoming' },
            ]}
          />
          <ProgressBar label={t('progress.quota')} value={1240} max={2000} />
          <ProgressBar
            label={t('progress.buckets')}
            value={900}
            max={2000}
            segments={[
              { label: t('progress.spent'), value: 600 },
              { label: t('progress.advance'), value: 300 },
            ]}
          />
          <Skeleton shape="row" count={2} />
        </Section>

        <Section id="people" title={t('asf.sections.people')}>
          <ProfileBanner
            name={t('sample.rahima')}
            headingLevel={2}
            status={
              <>
                <Chip>{t('sample.general_volunteer')}</Chip>
                <StatusChip status="approved" label={t('status.approved')} />
              </>
            }
            facts={[
              {
                id: 'nid',
                label: t('field.nid'),
                value: '1990123456789',
                icon: 'id-card',
                copy: true,
              },
              {
                id: 'district',
                label: t('table.village'),
                value: t('sample.char_bagdanga'),
                showLabel: true,
              },
            ]}
            actions={<Button variant="secondary">{t('card.edit')}</Button>}
          />
          <ProfileSection
            title={t('field.mobile')}
            icon="phone"
            headingLevel={3}
            action={
              <Button size="small" variant="text">
                {t('card.edit')}
              </Button>
            }
          >
            <DescriptionList
              items={[
                { label: t('asf.longLabel'), value: t('sample.char_bagdanga') },
                { label: t('field.mobile'), value: '01711000000' },
              ]}
            />
            <ContactList
              items={[
                {
                  id: 'm',
                  icon: 'phone',
                  label: t('field.mobile'),
                  value: '01711000000',
                  href: 'tel:01711000000',
                  actionLabel: t('asf.open'),
                  copy: true,
                },
              ]}
            />
          </ProfileSection>
          <div className="asf-gallery-row">
            <IconTile icon="users" tone="info" />
            <IconTile name={t('sample.karim')} />
            <PersonCell name={t('sample.ayesha')} secondary={t('sample.purba_para')} />
          </div>
        </Section>

        <Section id="overlays" title={t('asf.sections.overlays')}>
          <div className="asf-gallery-row">
            <Button variant="secondary" onClick={() => setOpen('dialog')}>
              {t('overlay.openModal')}
            </Button>
            <Button variant="secondary" onClick={() => setOpen('confirm')}>
              {t('overlay.openConfirm')}
            </Button>
            <Button variant="secondary" onClick={() => setOpen('drawer')}>
              {t('overlay.openDrawer')}
            </Button>
            <Button variant="secondary" onClick={() => setOpen('photos')}>
              {t('overlay.openPhotos')}
            </Button>
            <Menu
              label={t('menu.label')}
              items={[
                { id: 'profile', label: t('menu.profile'), icon: 'user', to: '/account/profile' },
                {
                  id: 'devices',
                  label: t('menu.devices'),
                  icon: 'devices',
                  to: '/account/sessions',
                },
                {
                  id: 'logout',
                  label: t('menu.logout'),
                  icon: 'sign-out',
                  onSelect: () => {},
                  tone: 'danger',
                },
              ]}
            >
              {t('menu.name')}
            </Menu>
          </div>
          <Dialog
            open={open === 'dialog'}
            onClose={() => setOpen(null)}
            title={t('overlay.modalTitle')}
            actions={<Button onClick={() => setOpen(null)}>{t('overlay.unlock')}</Button>}
          >
            <p>{t('asf.dialogText')}</p>
          </Dialog>
          <ConfirmDialog
            open={open === 'confirm'}
            title={t('overlay.confirmTitle')}
            message={t('overlay.confirmMessage')}
            consequences={[t('overlay.confirmConsequence')]}
            confirmLabel={t('overlay.confirmLabel')}
            tone="danger"
            reasonRequired
            onConfirm={() => setOpen(null)}
            onCancel={() => setOpen(null)}
          />
          <Drawer
            open={open === 'drawer'}
            onClose={() => setOpen(null)}
            title={t('overlay.drawerTitle')}
            actions={<Button onClick={() => setOpen(null)}>{t('overlay.apply')}</Button>}
          >
            <SelectField
              label={t('table.village')}
              options={districts}
              value={district}
              onChange={setDistrict}
            />
            {/* a list opened in the sheet stays in it and scrolls with it on a phone */}
            <Combobox
              label={t('overlay.drawerSearch')}
              options={districts}
              value={district}
              onChange={(next) => setDistrict(next ?? '')}
            />
          </Drawer>
          <PhotoViewer
            open={open === 'photos'}
            onClose={() => setOpen(null)}
            photos={SAMPLE_PHOTOS.map((p) => ({ id: p.id, src: p.src, alt: t(p.alt) }))}
            index={photo}
            onIndexChange={setPhoto}
            title={t('overlay.photosTitle')}
            details={<p>{t('overlay.photoDetails')}</p>}
          />
        </Section>

        <Section id="lists" title={t('asf.sections.lists')}>
          <OfflineBanner state="offline" pendingCount={3} onOpenOutbox={() => {}} />
          <BulkList
            label={t('bulk.label')}
            selectAllLabel={t('bulk.selectAll')}
            onSelectAll={() => {}}
            someSelected
            selectedCount={1}
          >
            <BulkRow
              title={t('sample.rahima')}
              meta={`APP-0012 · ${t('sample.char_bagdanga')}`}
              selected
              onSelect={() => {}}
              state={{ status: 'approved', label: t('status.approved') }}
              syncState={{ status: 'sync_pending', label: t('status.sync_pending') }}
              quickAction={{ label: t('bulk.distributed'), icon: 'check', onClick: () => {} }}
              menuActions={[
                { id: 'absent', label: t('bulk.absent'), onSelect: () => {} },
                { id: 'later', label: t('bulk.later'), onSelect: () => {} },
              ]}
            >
              <p>{t('bulk.quantity', { blanket: 2, shawl: 1 })}</p>
            </BulkRow>
          </BulkList>
          <AttentionCard
            tone="warning"
            icon="hourglass"
            title={t('asf.attention')}
            reason={t('asf.attentionReason')}
            meta={t('asf.attentionMeta')}
            to="/"
          />
          <Alert tone="info">{t('asf.dialogText')}</Alert>
          <EmptyState title={t('states.emptyTitle')} description={t('states.emptyText')} />
          <Disclosure title={t('row.distribution')} hint={t('row.distributionDesc')} defaultOpen>
            <p>{t('row.photoRuleValue')}</p>
          </Disclosure>
          <FileUpload
            label={t('file.photo')}
            source="camera_or_gallery"
            value={[
              { id: 'a', name: 'door.jpg', state: 'uploading', progress: 40, removable: true },
              { id: 'b', name: 'roof.jpg', state: 'failed', reason: t('file.networkLost') },
            ]}
            onAdd={() => {}}
            onRemove={() => {}}
            onRetry={() => {}}
          />
          <Card title={t('card.projectTitle')} icon="project">
            <p>{t('card.projectSub')}</p>
          </Card>
        </Section>

        {/* the pieces the app added to the asf contract after the gallery's first sections (local.json) */}
        <Section id="cards" title={t('asf.sections.cards')}>
          <div className="asf-gallery-cards">
            <FlipCard
              title={t('flip.programTitle')}
              to="/dev/asf"
              badge={t('flip.programBadge')}
              media={<CoverArt seed="program-upcd" />}
              front={
                <DescriptionList
                  layout="grid"
                  columns={3}
                  items={[
                    { label: t('flip.projects'), value: '4' },
                    { label: t('flip.running'), value: '3' },
                    { label: t('flip.people'), value: '1,240' },
                  ]}
                />
              }
              backEyebrow={t('flip.programEyebrow')}
              back={
                <>
                  <PersonCell name={t('flip.pmName')} secondary={t('flip.pm')} />
                  <DescriptionList
                    items={[
                      { label: t('flip.applications'), value: '412' },
                      { label: t('flip.sessions'), value: '6' },
                    ]}
                  />
                  <LinkButton variant="secondary" to="/dev/asf" fullWidth>
                    {t('flip.open')}
                  </LinkButton>
                </>
              }
            />
            <FlipCard
              title={t('flip.projectTitle')}
              to="/dev/asf"
              badge={t('flip.projectBadge')}
              media={<CoverArt seed="series-swb" />}
              mediaCorner={<Chip tone="warning">{t('flip.daysLeft')}</Chip>}
              mediaFoot={<Chip tone="success">{t('flip.session')}</Chip>}
              front={<ProgressBar label={t('flip.approved')} value={412} max={600} showValue />}
              backEyebrow={t('flip.projectEyebrow')}
              back={
                <DescriptionList
                  items={[
                    { label: t('flip.applications'), value: '980' },
                    { label: t('flip.people'), value: '2,310' },
                  ]}
                />
              }
            />
          </div>
        </Section>
        <Section id="record" title={t('record.section')}>
          <RecordHeader
            headingLevel={2}
            title={t('flip.projectTitle')}
            media={<CoverArt seed="series-swb" />}
            status={<Chip tone="success">{t('flip.session')}</Chip>}
            facts={[
              {
                id: 'session',
                label: t('record.session'),
                value: t('record.sessionValue'),
                icon: 'calendar',
              },
              { id: 'code', label: t('record.code'), value: t('record.codeValue'), icon: 'hash' },
              {
                id: 'program',
                label: t('record.program'),
                value: t('record.programValue'),
                icon: 'hand-heart',
              },
            ]}
            description={t('record.description')}
            actionsLabel={t('record.actions')}
            actions={
              <Button variant="secondary" startIcon="edit">
                {t('record.edit')}
              </Button>
            }
            footer={
              <LinkTabs
                label={t('record.tabs')}
                items={[
                  { to: '/dev/asf', label: t('record.summary'), icon: 'home', current: true },
                  {
                    to: '/dev/asf#applications',
                    label: t('record.applications'),
                    icon: 'clipboard',
                  },
                  { to: '/dev/asf#reports', label: t('record.reports'), icon: 'chart' },
                ]}
              />
            }
          />
          <RecordHeader
            compact
            headingLevel={2}
            actionsLabel={t('record.compact_actions')}
            title={t('flip.projectTitle')}
            media={<CoverArt seed="series-swb" />}
            status={<Chip tone="success">{t('flip.session')}</Chip>}
            actions={
              <Button variant="secondary" startIcon="edit">
                {t('record.edit')}
              </Button>
            }
          />
        </Section>
        <Section id="additions" title={t('asf.sections.additions')}>
          <SummaryBanner
            title={t('card.projectTitle')}
            subtitle={t('card.projectSub')}
            items={[
              { label: t('card.statApplications'), value: '1,240', icon: 'clipboard' },
              { label: t('card.statApproved'), value: '860', icon: 'verified', tone: 'success' },
            ]}
          />
          <div className="asf-gallery-row">
            <SegmentedControl
              label={t('segmented.label')}
              value="cards"
              options={[
                { value: 'cards', label: t('segmented.cards') },
                { value: 'list', label: t('segmented.list') },
              ]}
              onChange={() => {}}
            />
          </div>
          <div className="asf-gallery-row">
            <StatCard label={t('card.statDistributed')} value="20,00,000" icon="package" to="/" />
            <StatFilterBar
              label={t('card.statApplications')}
              items={[{ id: 'all', label: t('table.chipAll'), value: 2000000, icon: 'users' }]}
              selectedId="all"
              onSelect={() => {}}
              moreLabel={t('table.chipRemaining')}
              moreValue={(hidden) => String(hidden)}
            />
          </div>
          <Alert tone="success" title={t('alert.successTitle')} onDismiss={() => {}}>
            {t('alert.infoText')}
          </Alert>
          <div className="asf-gallery-row">
            <Button endIcon="arrow-right">{t('button.link')}</Button>
            <Button loading>{t('button.loading')}</Button>
            <LinkButton variant="secondary" startIcon="arrow-left" to="/">
              {t('button.link')}
            </LinkButton>
            <IconButton label={t('button.link')} icon="bell" to="/" />
            <Button variant="text" size="small" startIcon="edit" ariaLabel={t('card.edit')}>
              {t('card.edit')}
            </Button>
          </div>
          <Tabs
            label={t('tabs.label')}
            items={[
              {
                value: 'answers',
                label: t('tabs.answers'),
                count: '12',
                content: <p>{t('tabs.answersBody')}</p>,
              },
              {
                value: 'history',
                label: t('tabs.history'),
                count: '3',
                content: <p>{t('tabs.historyBody')}</p>,
              },
            ]}
          />
          <DateField label={t('asf.date')} value="2026-11-04" onChange={() => {}} />
          <DataTable
            label={t('card.projectTitle')}
            columns={[
              { id: 'name', header: t('table.name'), cell: (r: Row) => r.name, isRowHeader: true },
              { id: 'village', header: t('table.village'), cell: (r: Row) => r.village },
            ]}
            rows={rows.slice(0, 2)}
            getRowId={(r) => r.id}
            rowLabel={(r) => r.name}
            cursorPagination={{
              summary: t('asf.pagesNote'),
              hasPrevious: true,
              hasNext: true,
              onPrevious: () => {},
              onNext: () => {},
              page: 2,
              pageCount: 5,
              onPage: () => {},
            }}
          />
        </Section>
      </Page>
    </div>
  );
}
