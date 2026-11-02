import {
  formatCount,
  formatDate,
  formatDateTime,
  formatDuration,
  formatFileSize,
  formatGps,
  formatTaka,
  TAKA_SIGN,
} from '@css/shared/format';
import {
  Alert,
  AttentionCard,
  Avatar,
  Badge,
  IconTile,
  PageHeader,
  PersonCell,
  Breadcrumb,
  BulkList,
  BulkRow,
  Button,
  Card,
  CheckboxGroup,
  Combobox,
  ConfirmDialog,
  DateField,
  Drawer,
  EmptyState,
  ErrorState,
  ErrorSummary,
  FileUpload,
  Form,
  FormActions,
  FormGrid,
  FormSection,
  Icon,
  MenuButton,
  Modal,
  NavItem,
  NumberField,
  OfflineBanner,
  PasswordField,
  PhoneField,
  ProgressBar,
  RadioGroup,
  RowToggle,
  ChoiceTiles,
  Disclosure,
  Select,
  Skeleton,
  Spinner,
  Stack,
  StatCard,
  STATUS_STYLES,
  StatusBadge,
  type StatusKey,
  Table,
  type TableColumn,
  TableToolbar,
  Tabs,
  Text,
  TextArea,
  TextField,
  Timeline,
  type UploadItem,
} from '@css/ui';
import {
  AlignLeft,
  Banknote,
  Camera,
  ClipboardList,
  Clock,
  Hash,
  Pencil,
  ShieldCheck,
  Type,
  FolderKanban,
  Home,
  Menu,
  Plus,
  Save,
  TriangleAlert,
  Users,
  CircleUser,
} from 'lucide-react';
import { useLocale, useTranslations } from 'use-intl';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LanguageSwitch } from '../components/LanguageSwitch';
import './gallery.css';

// Sample data of the gallery (TEST_STRATEGY 4): fake numbers and fixed moments, formatted by the
// central formatter so digits stay English in both languages (UX-05).
const SAMPLE_MOBILE = '01700000001';
const SAMPLE_MOMENT = new Date(Date.UTC(2026, 9, 11, 4, 30)); // 11-10-2026 10:30 in Dhaka
const DISTRICTS = [
  'dhaka',
  'gazipur',
  'narayanganj',
  'narsingdi',
  'manikganj',
  'munshiganj',
  'rangpur',
  'dinajpur',
  'nilphamari',
  'kurigram',
  'lalmonirhat',
  'gaibandha',
] as const;
const TYPES = [
  'elderly',
  'widow',
  'orphan',
  'disabled',
  'ill',
  'labourer',
  'extremely_poor',
  'other',
] as const;
const ITEMS = ['blanket', 'shawl', 'sweater', 'other'] as const;
const STAGES = ['foundation', 'walls', 'roof', 'handover'] as const;
const SECTION_KEYS = ['type', 'button', 'badge', 'card', 'field', 'select', 'choice'] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="gallery-section-title">
        {title}
      </h2>
      <Stack gap={4}>{children}</Stack>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <Stack direction="row" wrap align="center" gap={2}>
      {children}
    </Stack>
  );
}

interface AppRow {
  id: string;
  name: string;
  number: string;
  village: string;
  score: number;
  status: StatusKey;
}

export function Gallery() {
  const [hydrated, setHydrated] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- marks hydration for the E2E tests
  useEffect(() => setHydrated(true), []);
  return (
    <div data-hydrated={hydrated || undefined}>
      <GalleryBody />
    </div>
  );
}

function GalleryBody() {
  const t = useTranslations('gallery');
  const tc = useTranslations('common');
  const locale = useLocale();
  const statusLabel = (key: StatusKey) => t(`status.${key}`);
  const count = (n: number) => formatCount(n, locale);
  const stamp = t('file.meta', {
    datetime: formatDateTime(SAMPLE_MOMENT, locale),
    gps: formatGps(25.7439, 89.2752),
  });

  // field state
  const [note, setNote] = useState('');
  const [correction, setCorrection] = useState(false);
  // select state
  const typeOptions = TYPES.map((id) => ({ id, label: t(`select.types.${id}`) }));
  const districtOptions = DISTRICTS.map((id) => ({ id, label: t(`district.${id}`) }));
  const [otherType, setOtherType] = useState('');
  // uploads
  const [photos, setPhotos] = useState<UploadItem[]>([
    { id: 'p1', name: 'IMG_0412.jpg', state: 'ready' },
    { id: 'p2', name: 'IMG_0413.jpg', state: 'uploading', progress: 45 },
  ]);
  const [documents, setDocuments] = useState<UploadItem[]>([
    { id: 'd1', name: 'voucher-0012.pdf', state: 'quarantined', removable: false },
    { id: 'd2', name: 'voucher-0013.pdf', state: 'failed' },
  ]);
  // form
  const [showErrors, setShowErrors] = useState(false);
  // table
  const rows: AppRow[] = useMemo(
    () => [
      {
        id: 'a1',
        name: t('sample.rahima'),
        number: 'WNT-2026-00001',
        village: t('sample.char_bagdanga'),
        score: 82,
        status: 'approved',
      },
      {
        id: 'a2',
        name: t('sample.karim'),
        number: 'WNT-2026-00002',
        village: t('sample.purba_para'),
        score: 64,
        status: 'under_review',
      },
      {
        id: 'a3',
        name: t('sample.ayesha'),
        number: 'WNT-2026-00003',
        village: t('sample.char_bagdanga'),
        score: 71,
        status: 'waitlisted',
      },
    ],
    [t],
  );
  const [sort, setSort] = useState<{ column: string; direction: 'ascending' | 'descending' }>({
    column: 'score',
    direction: 'descending',
  });
  const sorted = [...rows].sort((a, b) => {
    const dir = sort.direction === 'ascending' ? 1 : -1;
    return sort.column === 'score'
      ? (a.score - b.score) * dir
      : a.name.localeCompare(b.name, locale) * dir;
  });
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [chip, setChip] = useState('all');
  const [opened, setOpened] = useState<string | null>(null);
  const columns: TableColumn<AppRow>[] = [
    { id: 'name', header: t('table.name'), cell: (r) => r.name, isRowHeader: true, sortable: true },
    {
      id: 'number',
      header: t('table.number'),
      cell: (r) => <span className="ui-tnum">{r.number}</span>,
      priority: 2,
    },
    { id: 'village', header: t('table.village'), cell: (r) => r.village, priority: 3 },
    {
      id: 'score',
      header: t('table.score'),
      cell: (r) => count(r.score),
      numeric: true,
      sortable: true,
      priority: 4,
    },
    {
      id: 'status',
      header: t('table.status'),
      cell: (r) => <StatusBadge status={r.status} label={statusLabel(r.status)} size="sm" />,
    },
  ];
  // overlays
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmResult, setConfirmResult] = useState('');
  // states and bulk
  const [retried, setRetried] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set(['a1']));
  const [expanded, setExpanded] = useState(false);
  const bulkRows = rows.slice(0, 2);

  return (
    <main className="gallery">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('intro')}
        actions={<LanguageSwitch />}
      />

      <Stack gap={6}>
        <Section id="type" title={t('sections.type')}>
          <p className="gallery-display">{t('type.display')}</p>
          <p className="gallery-title">{t('type.title')}</p>
          <p className="gallery-body">
            {t('type.body', {
              name: t('sample.rahima'),
              village: t('sample.char_bagdanga'),
              mobile: SAMPLE_MOBILE,
              amount: formatTaka(300000, locale),
            })}
          </p>
          <p className="gallery-label">{t('type.label')}</p>
          <p className="gallery-caption">
            {t('type.caption', { datetime: formatDateTime(SAMPLE_MOMENT, locale) })}
          </p>
        </Section>

        <Section id="button" title={t('sections.button')}>
          <Row>
            <Button>{t('button.primary')}</Button>
            <Button variant="secondary">{t('button.secondary')}</Button>
            <Button variant="ghost" icon={Save}>
              {t('button.ghost')}
            </Button>
            <Button variant="danger">{t('button.danger')}</Button>
          </Row>
          <Row>
            <Button size="sm" variant="secondary">
              {t('button.small')}
            </Button>
            <Button icon={Plus} iconOnly variant="secondary">
              {t('button.icon')}
            </Button>
            <Button loading>{t('button.loading')}</Button>
            <Button disabled>{t('button.disabled')}</Button>
            <Button href="#card" variant="ghost">
              {t('button.link')}
            </Button>
          </Row>
        </Section>

        <Section id="menu" title={t('sections.menu')}>
          <Row>
            <MenuButton
              label={t('menu.label')}
              icon={CircleUser}
              items={[
                { id: 'profile', label: t('menu.profile'), href: '#menu' },
                { id: 'devices', label: t('menu.devices'), href: '#menu' },
                { id: 'logout', label: t('menu.logout'), onAction: () => undefined },
              ]}
            >
              {t('menu.name')}
            </MenuButton>
          </Row>
        </Section>

        <Section id="badge" title={t('sections.badge')}>
          <Row>
            {(Object.keys(STATUS_STYLES) as StatusKey[]).map((key) => (
              <StatusBadge key={key} status={key} label={statusLabel(key)} />
            ))}
          </Row>
          <Row>
            <Badge label={t('project_code')} tone="brand" />
            <StatusBadge status="approved" label={statusLabel('approved')} size="sm" />
          </Row>
          <Row>
            <Badge variant="dot" tone="success" label={statusLabel('approved')} />
            <Badge variant="dot" tone="warning" label={statusLabel('waitlisted')} />
            <Badge variant="dot" tone="info" label={statusLabel('under_review')} />
            <Badge variant="dot" tone="danger" label={statusLabel('rejected')} />
            <Badge variant="dot" label={statusLabel('draft')} />
          </Row>
          <Row>
            <PersonCell name={t('card.personName')} href="#badge" secondary={t('card.personSub')} />
            <PersonCell name={t('card.personName2')} secondary={t('card.personSub2')} />
            <IconTile icon={Users} />
            <IconTile icon={Clock} tone="warning" size="lg" />
          </Row>
        </Section>

        <Section id="card" title={t('sections.card')}>
          <div className="gallery-stats">
            <StatCard
              label={t('card.statApplications')}
              value={1840}
              icon={ClipboardList}
              context={t('card.thisWeek', { count: count(120) })}
            />
            <StatCard label={t('card.statPending')} value={42} icon={Clock} tone="warning" />
            <StatCard label={t('card.statVolunteers')} value={312} icon={Users} tone="info" />
            <StatCard label={t('card.statBlocked')} value={3} icon={TriangleAlert} tone="danger" />
          </div>
          <div className="gallery-stats">
            <StatCard
              label={t('card.statApplications')}
              value={1840}
              delta={t('card.thisWeek', { count: count(120) })}
            />
            <StatCard label={t('card.statApproved')} value={1240} target={2000} />
            <StatCard label={t('card.statDistributed')} value={860} target={2000} />
            <StatCard
              label={t('card.statBudget')}
              value={300000}
              target={500000}
              prefix={TAKA_SIGN}
            />
          </div>
          <div className="gallery-cols-2">
            <Card
              title={t('card.projectTitle')}
              subtitle={t('card.projectSub')}
              actions={
                <Button variant="ghost" size="sm">
                  {t('card.edit')}
                </Button>
              }
            >
              <p>
                {t('card.projectBody', { target: count(2000), date: formatDate('2026-12-01') })}
              </p>
            </Card>
            <Stack gap={3}>
              <AttentionCard
                tone="warning"
                icon={Clock}
                title={t('card.attentionTitle', { n: 12, count: count(12) })}
                reason={t('card.attentionReason')}
                meta={t('card.attentionMeta', { duration: formatDuration(6, 'day', locale) })}
                href="#table"
              />
              <AttentionCard
                tone="danger"
                icon={Camera}
                title={t('card.attention2Title', { n: 3, count: count(3) })}
                action={
                  <Button size="sm" variant="secondary">
                    {t('card.open')}
                  </Button>
                }
              />
            </Stack>
            <Card title={t('card.linked')} href="#card" />
            <Card accent>
              <Text>{t('card.accent')}</Text>
            </Card>
            <StatCard label={t('card.statApproved')} value={0} loading />
          </div>
        </Section>

        <Section id="field" title={t('sections.field')}>
          <FormGrid>
            <TextField label={t('field.name')} required helper={t('field.nameHelper')} />
            <TextField
              label={t('field.father')}
              defaultValue={t('field.fatherValue')}
              locked
              changed
              previousValue={t('field.fatherOld')}
              onRequestCorrection={() => setCorrection(true)}
              helper={correction ? t('field.correctionRequested') : undefined}
            />
            <TextField label={t('field.nid')} type="nid" required helper={t('field.nidHelper')} />
            <NumberField label={t('field.members')} />
            <NumberField label={t('field.income')} kind="money" />
            <PhoneField
              label={t('field.mobile')}
              required
              defaultValue={SAMPLE_MOBILE}
              error={t('field.mobileError')}
            />
            <PasswordField label={t('field.password')} autoComplete="current-password" required />
            <TextField
              label={t('field.otp')}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
            />
          </FormGrid>
          <TextArea label={t('field.note')} value={note} onChange={setNote} />
          <TextArea label={t('field.official')} officialOnly />
        </Section>

        <Section id="select" title={t('sections.select')}>
          <FormGrid>
            <Select
              label={t('select.type')}
              options={typeOptions}
              required
              otherOptionId="other"
              otherValue={otherType}
              onOtherChange={setOtherType}
            />
            <Select label={t('select.district')} options={districtOptions} />
            <Combobox label={t('select.upazila')} options={districtOptions} />
            <DateField label={t('select.date')} defaultValue="2026-12-01" />
          </FormGrid>
        </Section>

        <Section id="choice" title={t('sections.choice')}>
          <FormGrid>
            <CheckboxGroup
              label={t('choice.items')}
              options={ITEMS.map((id) => ({ id, label: t(`choice.itemOptions.${id}`) }))}
              defaultValue={['blanket']}
              otherOptionId="other"
            />
            <RadioGroup
              label={t('choice.gender')}
              required
              options={(['female', 'male'] as const).map((id) => ({
                id,
                label: t(`choice.genderOptions.${id}`),
              }))}
            />
          </FormGrid>
        </Section>

        <Section id="file" title={t('sections.file')}>
          <FileUpload
            label={t('file.photo')}
            helper={t('file.photoHelper', { max: count(3) })}
            source="camera_or_gallery"
            accept={['image/jpeg', 'image/png']}
            multiple
            maxFiles={3}
            value={photos.map((p) => ({ ...p, meta: stamp }))}
            onAdd={(files) =>
              setPhotos((list) => [
                ...list,
                ...files.map((f, i) => ({
                  id: `${f.name}-${Date.now()}-${i}`,
                  name: f.name,
                  state: 'selected' as const,
                  previewUrl: URL.createObjectURL(f),
                })),
              ])
            }
            onRemove={(id) => setPhotos((list) => list.filter((p) => p.id !== id))}
          />
          <FileUpload
            label={t('file.document')}
            helper={t('file.documentHelper', { size: formatFileSize(5 * 1024 * 1024, locale) })}
            accept={['application/pdf', 'image/jpeg']}
            maxSize={5 * 1024 * 1024}
            maxSizeText={formatFileSize(5 * 1024 * 1024, locale)}
            multiple
            value={documents.map((d) =>
              d.state === 'failed' ? { ...d, reason: t('file.networkLost') } : d,
            )}
            onAdd={(files) =>
              setDocuments((list) => [
                ...list,
                ...files.map((f) => ({ id: f.name, name: f.name, state: 'selected' as const })),
              ])
            }
            onRemove={(id) => setDocuments((list) => list.filter((d) => d.id !== id))}
            onRetry={(id) =>
              setDocuments((list) =>
                list.map((d) => (d.id === id ? { ...d, state: 'uploading', progress: 10 } : d)),
              )
            }
          />
        </Section>

        <Section id="form" title={t('sections.form')}>
          <Form
            aria-label={t('form.formLabel')}
            onSubmit={(e) => {
              e.preventDefault();
              setShowErrors(true);
            }}
          >
            {showErrors && (
              <ErrorSummary
                errors={[
                  { fieldId: 'gallery-name', message: t('form.nameMissing') },
                  { fieldId: 'gallery-mobile', message: t('form.mobileMissing') },
                ]}
              />
            )}
            <FormSection title={t('form.basic')} description={t('form.basicDesc')}>
              <FormGrid>
                <TextField
                  id="gallery-name"
                  label={t('field.name')}
                  required
                  error={showErrors ? t('form.nameMissing') : undefined}
                />
                <PhoneField
                  id="gallery-mobile"
                  label={t('field.mobile')}
                  required
                  error={showErrors ? t('form.mobileMissing') : undefined}
                />
              </FormGrid>
            </FormSection>
            <FormActions>
              <Button variant="secondary">{t('form.saveDraft')}</Button>
              <Button type="submit">{t('form.submit')}</Button>
            </FormActions>
          </Form>
        </Section>

        <Section id="nav" title={t('sections.nav')}>
          <div className="gallery-cols-3">
            <nav aria-label={t('nav.sidebar')} className="gallery-panel gallery-sidebar">
              <NavItem icon={Home} label={t('nav.home')} href="#nav" active />
              <NavItem icon={ClipboardList} label={t('nav.review')} href="#table" badge={12} />
              <NavItem icon={Users} label={t('nav.people')} href="#nav" />
            </nav>
            <nav aria-label={t('nav.rail')} className="gallery-panel gallery-rail">
              <NavItem icon={Home} label={t('nav.home')} href="#nav" variant="rail" active />
              <NavItem
                icon={ClipboardList}
                label={t('nav.review')}
                href="#table"
                variant="rail"
                badge={150}
              />
            </nav>
            <nav aria-label={t('nav.tabBar')} className="gallery-panel gallery-tabbar">
              <NavItem icon={Home} label={t('nav.home')} href="#nav" variant="tab-bar" active />
              <NavItem
                icon={ClipboardList}
                label={t('nav.review')}
                href="#table"
                variant="tab-bar"
                badge={8}
              />
              <NavItem icon={Users} label={t('nav.people')} href="#nav" variant="tab-bar" />
              <NavItem
                icon={FolderKanban}
                label={t('nav.projects')}
                href="#nav"
                variant="tab-bar"
              />
              <NavItem icon={Menu} label={t('nav.more')} href="#nav" variant="tab-bar" />
            </nav>
          </div>
        </Section>

        <Section id="tiles" title={t('sections.tiles')}>
          <div className="gallery-panel">
            <ChoiceTiles
              label={t('tiles.label')}
              defaultValue="short"
              tiles={[
                {
                  title: t('tiles.text'),
                  tiles: [
                    {
                      id: 'short',
                      title: t('tiles.short'),
                      description: t('tiles.shortDesc'),
                      icon: Type,
                    },
                    {
                      id: 'long',
                      title: t('tiles.long'),
                      description: t('tiles.longDesc'),
                      icon: AlignLeft,
                    },
                  ],
                },
                {
                  title: t('tiles.number'),
                  tiles: [
                    {
                      id: 'count',
                      title: t('tiles.count'),
                      description: t('tiles.countDesc'),
                      icon: Hash,
                    },
                    {
                      id: 'money',
                      title: t('tiles.money'),
                      description: t('tiles.moneyDesc'),
                      icon: Banknote,
                    },
                  ],
                },
              ]}
            />
            <Disclosure
              title={t('tiles.groupBasics')}
              hint={t('tiles.groupBasicsHint')}
              icon={Pencil}
              defaultOpen
            >
              <Text>{t('tiles.inside')}</Text>
            </Disclosure>
            <Disclosure
              title={t('tiles.groupRules')}
              hint={t('tiles.groupRulesHint')}
              icon={ShieldCheck}
            >
              <Text>{t('tiles.inside')}</Text>
            </Disclosure>
          </div>
        </Section>

        <Section id="row" title={t('sections.row')}>
          <div className="gallery-panel gallery-rows">
            <RowToggle
              control="switch"
              title={t('row.distribution')}
              description={t('row.distributionDesc')}
              defaultChecked
            />
            <RowToggle
              control="switch"
              title={t('row.form')}
              checked
              lockedReason={t('row.formLocked')}
            />
            <RowToggle control="value" title={t('row.photoRule')} value={t('row.photoRuleValue')} />
            <RowToggle control="chevron" title={t('row.notifications')} href="#row" />
          </div>
        </Section>

        <Section id="table" title={t('sections.table')}>
          <Table
            label={t('table.label')}
            columns={columns}
            rows={sorted}
            rowKey={(r) => r.id}
            rowLabel={(r) => r.name}
            cardRenderer={(r) => (
              <Stack gap={1}>
                <Text weight="bold">{r.name}</Text>
                <Text className="gallery-caption">
                  <span className="ui-tnum">{r.number}</span> · {r.village}
                </Text>
                <div>
                  <StatusBadge status={r.status} label={statusLabel(r.status)} size="sm" />
                </div>
              </Stack>
            )}
            selectionMode="multiple"
            selectedKeys={selection}
            onSelectionChange={setSelection}
            sort={sort}
            onSortChange={setSort}
            onRowAction={setOpened}
            rowActions={(r) => (
              <Button variant="ghost" size="sm" onPress={() => setOpened(r.id)}>
                {t('table.view')}
              </Button>
            )}
            toolbar={
              <TableToolbar
                onSearch={() => {}}
                chips={[
                  { id: 'all', label: t('table.chipAll'), count: 3 },
                  { id: 'remaining', label: t('table.chipRemaining'), count: 2 },
                  { id: 'done', label: t('table.chipDone'), count: 1 },
                ]}
                activeChip={chip}
                onChipChange={setChip}
                filters={<Select label={t('select.district')} options={districtOptions} />}
                activeFilterCount={1}
                onClearFilters={() => {}}
              />
            }
            pagination={{
              shown: 3,
              total: `${count(10000)}+`,
              hasNext: true,
              onNext: () => {},
              onLoadMore: () => {},
            }}
          />
          <p className="gallery-caption" data-testid="table-state">
            {t('table.selected')}: {count(selection.size)}
            {opened && ` · ${t('table.openRow')}: ${opened}`}
          </p>
        </Section>

        <Section id="overlay" title={t('sections.overlay')}>
          <Row>
            <Button variant="secondary" onPress={() => setModalOpen(true)}>
              {t('overlay.openModal')}
            </Button>
            <Button variant="secondary" onPress={() => setDrawerOpen(true)}>
              {t('overlay.openDrawer')}
            </Button>
            <Button variant="danger" onPress={() => setConfirmOpen(true)}>
              {t('overlay.openConfirm')}
            </Button>
          </Row>
          {confirmResult && (
            <p data-testid="confirm-result">{t('overlay.confirmed') + confirmResult}</p>
          )}
          <Modal
            title={t('overlay.modalTitle')}
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            secondaryAction={
              <Button variant="secondary" onPress={() => setModalOpen(false)}>
                {tc('action.cancel')}
              </Button>
            }
            primaryAction={
              <Button onPress={() => setModalOpen(false)}>{t('overlay.unlock')}</Button>
            }
          >
            <PhoneField label={t('overlay.newValue')} />
          </Modal>
          <Drawer
            title={t('overlay.drawerTitle')}
            isOpen={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            footer={<Button onPress={() => setDrawerOpen(false)}>{t('overlay.apply')}</Button>}
          >
            <Select label={t('select.district')} options={districtOptions} />
            <DateField label={t('select.date')} />
          </Drawer>
          <ConfirmDialog
            isOpen={confirmOpen}
            tone="danger"
            title={t('overlay.confirmTitle')}
            message={t('overlay.confirmMessage')}
            consequence={[t('overlay.confirmConsequence')]}
            reasonRequired
            confirmLabel={t('overlay.confirmLabel')}
            onConfirm={(reason) => {
              setConfirmResult(reason);
              setConfirmOpen(false);
            }}
            onCancel={() => setConfirmOpen(false)}
          />
        </Section>

        <Section id="alert" title={t('sections.alert')}>
          <Alert tone="info" title={t('alert.infoTitle')}>
            <p>{t('alert.infoText')}</p>
          </Alert>
          <Alert tone="success" title={t('alert.successTitle')} onDismiss={() => {}} />
          <Alert
            tone="warning"
            title={t('alert.warningTitle')}
            action={
              <Button variant="ghost" size="sm">
                {t('alert.action')}
              </Button>
            }
          >
            <p>{t('alert.warningText')}</p>
          </Alert>
          <Alert tone="danger" title={t('alert.dangerTitle')}>
            <p>{t('alert.dangerText')}</p>
          </Alert>
        </Section>

        <Section id="tabs" title={t('sections.tabs')}>
          <Tabs
            label={t('tabs.label')}
            items={[
              { id: 'answers', label: t('tabs.answers'), content: <p>{t('tabs.answersBody')}</p> },
              {
                id: 'history',
                label: t('tabs.history'),
                count: 4,
                content: <p>{t('tabs.historyBody')}</p>,
              },
              { id: 'changes', label: t('tabs.changes'), content: <p>{t('tabs.changesBody')}</p> },
            ]}
          />
          <Tabs
            label={t('tabs.segmentedLabel')}
            variant="segmented"
            items={[
              { id: 'list', label: t('tabs.list'), content: null },
              { id: 'map', label: t('tabs.map'), content: null },
            ]}
          />
          <Tabs
            label={t('tabs.manyLabel')}
            items={SECTION_KEYS.map((key) => ({
              id: key,
              label: t(`sections.${key}`),
              content: <p>{t(`sections.${key}`)}</p>,
            }))}
          />
        </Section>

        <Section id="breadcrumb" title={t('sections.breadcrumb')}>
          <Breadcrumb
            items={[
              { id: 'p', label: t('breadcrumb.projects'), href: '#breadcrumb' },
              { id: 'w', label: t('breadcrumb.project'), href: '#breadcrumb' },
              { id: 'a', label: t('breadcrumb.applications') },
            ]}
          />
        </Section>

        <Section id="states" title={t('sections.states')}>
          <div className="gallery-cols-3">
            <Card>
              <EmptyState
                title={t('states.emptyTitle')}
                message={t('states.emptyText')}
                action={<Button icon={Plus}>{t('states.emptyAction')}</Button>}
              />
            </Card>
            <Card>
              <Skeleton shape="row" count={3} />
            </Card>
            <Card>
              <ErrorState
                title={t('states.errorTitle')}
                message={retried ? t('states.retried') : t('states.errorText')}
                requestId="req-01JA7F3K2Q"
                onRetry={() => setRetried(true)}
              />
            </Card>
          </div>
        </Section>

        <Section id="offline" title={t('sections.offline')}>
          <OfflineBanner state="offline" pendingCount={7} onOpenOutbox={() => {}} />
          <OfflineBanner state="syncing" pendingCount={3} />
          <OfflineBanner state="sync_failed" pendingCount={2} onOpenOutbox={() => {}} />
        </Section>

        <Section id="bulk" title={t('sections.bulk')}>
          <BulkList
            label={t('bulk.label')}
            selectAllLabel={t('bulk.selectAll')}
            allSelected={bulkSelected.size === bulkRows.length}
            someSelected={bulkSelected.size > 0}
            onSelectAll={(on) =>
              setBulkSelected(on ? new Set(bulkRows.map((r) => r.id)) : new Set())
            }
            selectedCount={bulkSelected.size}
          >
            {bulkRows.map((r, i) => (
              <BulkRow
                key={r.id}
                title={r.name}
                meta={`${r.number} · ${r.village}`}
                selected={bulkSelected.has(r.id)}
                onSelect={(on) =>
                  setBulkSelected((set) => {
                    const next = new Set(set);
                    if (on) next.add(r.id);
                    else next.delete(r.id);
                    return next;
                  })
                }
                state={{ status: 'approved', label: statusLabel('approved') }}
                photoState={
                  i === 0
                    ? { status: 'photo_pending', label: statusLabel('photo_pending') }
                    : { status: 'photo_verified', label: statusLabel('photo_verified') }
                }
                syncState={{
                  status: i === 0 ? 'sync_pending' : 'sync_synced',
                  label: statusLabel(i === 0 ? 'sync_pending' : 'sync_synced'),
                }}
                quickAction={{ label: t('bulk.distributed'), onPress: () => {} }}
                menuActions={[
                  { id: 'absent', label: t('bulk.absent'), onAction: () => {} },
                  { id: 'later', label: t('bulk.later'), onAction: () => {} },
                  { id: 'not', label: t('bulk.notDistributed'), onAction: () => {} },
                  { id: 'damaged', label: t('bulk.damaged'), onAction: () => {} },
                  { id: 'partial', label: t('bulk.partial'), onAction: () => {} },
                ]}
                expanded={i === 0 && expanded}
                onExpandedChange={i === 0 ? setExpanded : undefined}
              >
                {i === 0 ? (
                  <Text>{t('bulk.quantity', { blanket: count(1), shawl: count(1) })}</Text>
                ) : undefined}
              </BulkRow>
            ))}
          </BulkList>
        </Section>

        <Section id="timeline" title={t('sections.timeline')}>
          <div className="gallery-cols-2">
            <Timeline
              label={t('timeline.label')}
              showActor
              steps={[
                {
                  id: 's1',
                  title: t('timeline.submitted'),
                  actor: t('timeline.actor1'),
                  time: formatDateTime(new Date(Date.UTC(2026, 9, 2, 4, 30)), locale),
                  status: 'done',
                },
                {
                  id: 's2',
                  title: t('timeline.review'),
                  actor: t('timeline.actor2'),
                  time: formatDateTime(new Date(Date.UTC(2026, 9, 5, 9, 15)), locale),
                  status: 'done',
                  comment: t('timeline.comment'),
                },
                {
                  id: 's3',
                  title: t('timeline.approval'),
                  status: 'current',
                  time: formatDate('2026-10-06'),
                },
                { id: 's4', title: t('timeline.distribution'), status: 'upcoming' },
              ]}
            />
            <Timeline
              label={t('timeline.stagesLabel')}
              orientation="horizontal"
              steps={STAGES.map((key, i) => ({
                id: key,
                title: t(`timeline.stages.${key}`),
                status: i < 1 ? 'done' : i === 1 ? 'current' : 'upcoming',
              }))}
            />
          </div>
        </Section>

        <Section id="progress" title={t('sections.progress')}>
          <ProgressBar label={t('progress.quota')} value={1240} max={2000} />
          <ProgressBar label={t('progress.budget')} value={460000} max={500000} tone="warning" />
          <ProgressBar
            label={t('progress.over')}
            value={520000}
            max={500000}
            tone="danger"
            size="sm"
          />
          <ProgressBar
            label={t('progress.buckets')}
            value={450000}
            max={500000}
            segments={[
              { label: t('progress.spent'), value: 300000 },
              { label: t('progress.advance'), value: 100000 },
              { label: t('progress.returned'), value: 20000 },
              { label: t('progress.claimed'), value: 30000 },
            ]}
          />
        </Section>

        <Section id="misc" title={t('sections.misc')}>
          <Row>
            <Avatar name={t('misc.person')} decorative={false} />
            <Avatar name={t('misc.avatarOther')} size="sm" decorative={false} />
            <Avatar name={t('misc.person')} size="lg" decorative={false} />
            <Spinner />
            <Icon icon={TriangleAlert} label={t('misc.icon')} />
          </Row>
        </Section>
      </Stack>
    </main>
  );
}
