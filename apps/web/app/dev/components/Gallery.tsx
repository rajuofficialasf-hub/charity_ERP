'use client';
/* eslint-disable security/detect-object-injection -- dev gallery: typed keys into constant sample tables */

import {
  Alert,
  AttentionCard,
  Avatar,
  Badge,
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
  Modal,
  NavItem,
  NumberField,
  OfflineBanner,
  PhoneField,
  ProgressBar,
  RadioGroup,
  RowToggle,
  Select,
  Skeleton,
  Spinner,
  StatCard,
  StatusBadge,
  STATUS_STYLES,
  Table,
  TableToolbar,
  Tabs,
  TextArea,
  TextField,
  Timeline,
  UiProvider,
  type StatusKey,
  type TableColumn,
  type UploadItem,
} from '@css/ui';
import { exampleMessages } from '@css/ui/example-messages';
import {
  Camera,
  ClipboardList,
  Clock,
  FolderKanban,
  Home,
  Menu,
  Plus,
  Save,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { content, type GalleryLocale } from './content';

// Stand-in for packages/shared/format until T1.5: English digits with lakh grouping (UX-05, O-42).
const formatNumber = (value: number) => value.toLocaleString('en-IN');

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="gallery-section">
      <h2 id={`${id}-title`} className="mb-3">
        {title}
      </h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

interface AppRow {
  id: string;
  name: string;
  number: string;
  village: string;
  score: number;
  status: StatusKey;
}

export function Gallery({ initialLocale = 'bn' }: { initialLocale?: GalleryLocale }) {
  const [locale, setLocale] = useState<GalleryLocale>(initialLocale);
  const [hydrated, setHydrated] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- marks hydration for the E2E tests
  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <UiProvider locale={locale} messages={exampleMessages[locale]} formatNumber={formatNumber}>
      <div data-hydrated={hydrated || undefined}>
        <GalleryBody locale={locale} onLocale={setLocale} />
      </div>
    </UiProvider>
  );
}

function GalleryBody({
  locale,
  onLocale,
}: {
  locale: GalleryLocale;
  onLocale: (l: GalleryLocale) => void;
}) {
  const c = content[locale];
  const statusLabel = (key: StatusKey) => c.status[key];

  // field state
  const [note, setNote] = useState('');
  const [correction, setCorrection] = useState(false);
  // select state
  const typeOptions = c.select.types.map((label, i) => ({
    id: i === 7 ? 'other' : `t${i}`,
    label,
  }));
  const districtOptions = [
    'Dhaka',
    'Gazipur',
    'Narayanganj',
    'Narsingdi',
    'Manikganj',
    'Munshiganj',
    'Rangpur',
    'Dinajpur',
    'Nilphamari',
    'Kurigram',
    'Lalmonirhat',
    'Gaibandha',
  ].map((name) => ({ id: name.toLowerCase(), label: name }));
  const [otherType, setOtherType] = useState('');
  // uploads
  const [photos, setPhotos] = useState<UploadItem[]>([
    { id: 'p1', name: 'IMG_0412.jpg', state: 'ready', meta: c.file.meta },
    { id: 'p2', name: 'IMG_0413.jpg', state: 'uploading', progress: 45, meta: c.file.meta },
  ]);
  const [documents, setDocuments] = useState<UploadItem[]>([
    { id: 'd1', name: 'voucher-0012.pdf', state: 'quarantined', removable: false },
    { id: 'd2', name: 'voucher-0013.pdf', state: 'failed', reason: c.file.networkLost },
  ]);
  // form
  const [showErrors, setShowErrors] = useState(false);
  // table
  const rows: AppRow[] = useMemo(
    () => [
      {
        id: 'a1',
        name: locale === 'bn' ? 'রহিমা খাতুন (নমুনা)' : 'Rahima Khatun (sample)',
        number: 'WNT-2026-00001',
        village: locale === 'bn' ? 'চর বাগডাঙ্গা' : 'Char Bagdanga',
        score: 82,
        status: 'approved',
      },
      {
        id: 'a2',
        name: locale === 'bn' ? 'করিম মিয়া (নমুনা)' : 'Karim Mia (sample)',
        number: 'WNT-2026-00002',
        village: locale === 'bn' ? 'পূর্ব পাড়া' : 'Purba Para',
        score: 64,
        status: 'under_review',
      },
      {
        id: 'a3',
        name: locale === 'bn' ? 'আয়েশা বেগম (নমুনা)' : 'Ayesha Begum (sample)',
        number: 'WNT-2026-00003',
        village: locale === 'bn' ? 'চর বাগডাঙ্গা' : 'Char Bagdanga',
        score: 71,
        status: 'waitlisted',
      },
    ],
    [locale],
  );
  const [sort, setSort] = useState<{ column: string; direction: 'ascending' | 'descending' }>({
    column: 'score',
    direction: 'descending',
  });
  const sorted = [...rows].sort((a, b) => {
    const dir = sort.direction === 'ascending' ? 1 : -1;
    return sort.column === 'score' ? (a.score - b.score) * dir : a.name.localeCompare(b.name) * dir;
  });
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [chip, setChip] = useState('all');
  const [opened, setOpened] = useState<string | null>(null);
  const columns: TableColumn<AppRow>[] = [
    { id: 'name', header: c.table.name, cell: (r) => r.name, isRowHeader: true, sortable: true },
    {
      id: 'number',
      header: c.table.number,
      cell: (r) => <span className="ui-tnum">{r.number}</span>,
      priority: 2,
    },
    { id: 'village', header: c.table.village, cell: (r) => r.village, priority: 3 },
    {
      id: 'score',
      header: c.table.score,
      cell: (r) => formatNumber(r.score),
      numeric: true,
      sortable: true,
      priority: 4,
    },
    {
      id: 'status',
      header: c.table.status,
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
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set(['b1']));
  const [expanded, setExpanded] = useState(false);
  const bulkRows = rows.slice(0, 2);

  return (
    <main className="mx-auto max-w-content p-4 sm:p-5">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>{c.title}</h1>
          <p className="text-text-secondary">{c.intro}</p>
        </div>
        <RadioGroup
          label={c.language}
          orientation="horizontal"
          value={locale}
          onChange={(v) => onLocale(v as GalleryLocale)}
          options={[
            { id: 'bn', label: 'বাংলা' },
            { id: 'en', label: 'English' },
          ]}
          className="mb-0"
        />
      </header>

      <div className="flex flex-col gap-6">
        <Section id="type" title={c.sections.type}>
          <p className="text-display font-bold">{c.type.display}</p>
          <p className="text-title font-bold">{c.type.title}</p>
          <p className="text-body">{c.type.body}</p>
          <p className="text-label font-bold">{c.type.label}</p>
          <p className="text-caption text-text-secondary">{c.type.caption}</p>
        </Section>

        <Section id="button" title={c.sections.button}>
          <Row>
            <Button>{c.button.primary}</Button>
            <Button variant="secondary">{c.button.secondary}</Button>
            <Button variant="ghost" icon={Save}>
              {c.button.ghost}
            </Button>
            <Button variant="danger">{c.button.danger}</Button>
          </Row>
          <Row>
            <Button size="sm" variant="secondary">
              {c.button.small}
            </Button>
            <Button icon={Plus} iconOnly variant="secondary">
              {c.button.icon}
            </Button>
            <Button loading>{c.button.loading}</Button>
            <Button disabled>{c.button.disabled}</Button>
            <Button href="#card" variant="ghost">
              {c.button.link}
            </Button>
          </Row>
        </Section>

        <Section id="badge" title={c.sections.badge}>
          <Row>
            {(Object.keys(STATUS_STYLES) as StatusKey[]).map((key) => (
              <StatusBadge key={key} status={key} label={statusLabel(key)} />
            ))}
          </Row>
          <Row>
            <Badge label="WNT" tone="brand" />
            <StatusBadge status="approved" label={statusLabel('approved')} size="sm" />
          </Row>
        </Section>

        <Section id="card" title={c.sections.card}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <StatCard label={c.card.statApplications} value={1840} delta={c.card.thisWeek} />
            <StatCard label={c.card.statApproved} value={1240} target={2000} />
            <StatCard label={c.card.statDistributed} value={860} target={2000} />
            <StatCard label={c.card.statBudget} value={300000} target={500000} prefix="৳" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              title={c.card.projectTitle}
              subtitle={c.card.projectSub}
              actions={
                <Button variant="ghost" size="sm">
                  {c.card.edit}
                </Button>
              }
            >
              <p>{c.card.projectBody}</p>
            </Card>
            <div className="flex flex-col gap-3">
              <AttentionCard
                tone="warning"
                icon={Clock}
                title={c.card.attentionTitle}
                reason={c.card.attentionReason}
                meta={c.card.attentionMeta}
                href="#table"
              />
              <AttentionCard
                tone="danger"
                icon={Camera}
                title={c.card.attention2Title}
                action={
                  <Button size="sm" variant="secondary">
                    {c.card.open}
                  </Button>
                }
              />
            </div>
            <Card title={c.card.linked} href="#card" />
            <Card accent>
              <p className="mb-0">{c.card.accent}</p>
            </Card>
            <StatCard label={c.card.statApproved} value={0} loading />
          </div>
        </Section>

        <Section id="field" title={c.sections.field}>
          <FormGrid>
            <TextField label={c.field.name} required helper={c.field.nameHelper} />
            <TextField
              label={c.field.father}
              defaultValue={c.field.fatherValue}
              locked
              changed
              previousValue={c.field.fatherOld}
              onRequestCorrection={() => setCorrection(true)}
              helper={correction ? c.field.correctionRequested : undefined}
            />
            <TextField label={c.field.nid} type="nid" required helper={c.field.nidHelper} />
            <NumberField label={c.field.members} />
            <NumberField label={c.field.income} kind="money" />
            <PhoneField
              label={c.field.mobile}
              required
              defaultValue="01700000001"
              error={c.field.mobileError}
            />
          </FormGrid>
          <TextArea label={c.field.note} value={note} onChange={setNote} />
          <TextArea label={c.field.official} officialOnly />
        </Section>

        <Section id="select" title={c.sections.select}>
          <FormGrid>
            <Select
              label={c.select.type}
              options={typeOptions}
              required
              otherOptionId="other"
              otherValue={otherType}
              onOtherChange={setOtherType}
            />
            <Select label={c.select.district} options={districtOptions} />
            <Combobox label={c.select.upazila} options={districtOptions} />
            <DateField label={c.select.date} defaultValue="2026-12-01" />
          </FormGrid>
        </Section>

        <Section id="choice" title={c.sections.choice}>
          <FormGrid>
            <CheckboxGroup
              label={c.choice.items}
              options={c.choice.itemOptions.map((label, i) => ({
                id: i === 3 ? 'other' : `i${i}`,
                label,
              }))}
              defaultValue={['i0']}
              otherOptionId="other"
            />
            <RadioGroup
              label={c.choice.gender}
              required
              options={c.choice.genderOptions.map((label, i) => ({ id: `g${i}`, label }))}
            />
          </FormGrid>
        </Section>

        <Section id="file" title={c.sections.file}>
          <FileUpload
            label={c.file.photo}
            helper={c.file.photoHelper}
            source="camera_or_gallery"
            accept={['image/jpeg', 'image/png']}
            multiple
            maxFiles={3}
            value={photos}
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
            label={c.file.document}
            helper={c.file.documentHelper}
            accept={['application/pdf', 'image/jpeg']}
            maxSize={5 * 1024 * 1024}
            maxSizeText="5 MB"
            multiple
            value={documents}
            onAdd={(files) =>
              setDocuments((list) => [
                ...list,
                ...files.map((f) => ({ id: f.name, name: f.name, state: 'selected' as const })),
              ])
            }
            onRemove={(id) => setDocuments((list) => list.filter((d) => d.id !== id))}
            onRetry={(id) =>
              setDocuments((list) =>
                list.map((d) =>
                  d.id === id ? { ...d, state: 'uploading', progress: 10, reason: undefined } : d,
                ),
              )
            }
          />
        </Section>

        <Section id="form" title={c.sections.form}>
          <Form
            aria-label={c.form.formLabel}
            onSubmit={(e) => {
              e.preventDefault();
              setShowErrors(true);
            }}
          >
            {showErrors && (
              <ErrorSummary
                errors={[
                  { fieldId: 'gallery-name', message: c.form.nameMissing },
                  { fieldId: 'gallery-mobile', message: c.form.mobileMissing },
                ]}
              />
            )}
            <FormSection title={c.form.basic} description={c.form.basicDesc}>
              <FormGrid>
                <TextField
                  id="gallery-name"
                  label={c.field.name}
                  required
                  error={showErrors ? c.form.nameMissing : undefined}
                />
                <PhoneField
                  id="gallery-mobile"
                  label={c.field.mobile}
                  required
                  error={showErrors ? c.form.mobileMissing : undefined}
                />
              </FormGrid>
            </FormSection>
            <FormActions>
              <Button variant="secondary">{c.form.saveDraft}</Button>
              <Button type="submit">{c.form.submit}</Button>
            </FormActions>
          </Form>
        </Section>

        <Section id="nav" title={c.sections.nav}>
          <div className="grid gap-4 lg:grid-cols-3">
            <nav
              aria-label={c.nav.sidebar}
              className="flex flex-col gap-1 rounded-lg bg-bg-surface p-2 shadow-1"
            >
              <NavItem icon={Home} label={c.nav.home} href="#nav" active />
              <NavItem icon={ClipboardList} label={c.nav.review} href="#table" badge={12} />
              <NavItem icon={Users} label={c.nav.people} href="#nav" />
            </nav>
            <nav
              aria-label={c.nav.rail}
              className="flex w-[72px] flex-col gap-1 rounded-lg bg-bg-surface p-1 shadow-1"
            >
              <NavItem icon={Home} label={c.nav.home} href="#nav" variant="rail" active />
              <NavItem
                icon={ClipboardList}
                label={c.nav.review}
                href="#table"
                variant="rail"
                badge={150}
              />
            </nav>
            <nav
              aria-label={c.nav.tabBar}
              className="grid grid-cols-5 rounded-lg bg-bg-surface shadow-1"
            >
              <NavItem icon={Home} label={c.nav.home} href="#nav" variant="tab-bar" active />
              <NavItem
                icon={ClipboardList}
                label={c.nav.review}
                href="#table"
                variant="tab-bar"
                badge={8}
              />
              <NavItem icon={Users} label={c.nav.people} href="#nav" variant="tab-bar" />
              <NavItem icon={FolderKanban} label={c.nav.projects} href="#nav" variant="tab-bar" />
              <NavItem icon={Menu} label={c.nav.more} href="#nav" variant="tab-bar" />
            </nav>
          </div>
        </Section>

        <Section id="row" title={c.sections.row}>
          <div className="rounded-lg bg-bg-surface px-4 shadow-1">
            <RowToggle
              control="switch"
              title={c.row.distribution}
              description={c.row.distributionDesc}
              defaultChecked
            />
            <RowToggle
              control="switch"
              title={c.row.form}
              checked
              lockedReason={c.row.formLocked}
            />
            <RowToggle control="value" title={c.row.photoRule} value={c.row.photoRuleValue} />
            <RowToggle control="chevron" title={c.row.notifications} href="#row" />
          </div>
        </Section>

        <Section id="table" title={c.sections.table}>
          <Table
            label={c.table.label}
            columns={columns}
            rows={sorted}
            rowKey={(r) => r.id}
            rowLabel={(r) => r.name}
            cardRenderer={(r) => (
              <div className="flex flex-col gap-1">
                <p className="m-0 font-bold">{r.name}</p>
                <p className="m-0 text-caption text-text-secondary">
                  <span className="ui-tnum">{r.number}</span> · {r.village}
                </p>
                <div>
                  <StatusBadge status={r.status} label={statusLabel(r.status)} size="sm" />
                </div>
              </div>
            )}
            selectionMode="multiple"
            selectedKeys={selection}
            onSelectionChange={setSelection}
            sort={sort}
            onSortChange={setSort}
            onRowAction={setOpened}
            rowActions={(r) => (
              <Button variant="ghost" size="sm" onPress={() => setOpened(r.id)}>
                {c.table.view}
              </Button>
            )}
            toolbar={
              <TableToolbar
                onSearch={() => {}}
                chips={[
                  { id: 'all', label: c.table.chipAll, count: 3 },
                  { id: 'remaining', label: c.table.chipRemaining, count: 2 },
                  { id: 'done', label: c.table.chipDone, count: 1 },
                ]}
                activeChip={chip}
                onChipChange={setChip}
                filters={<Select label={c.select.district} options={districtOptions} />}
                activeFilterCount={1}
                onClearFilters={() => {}}
              />
            }
            pagination={{
              shown: 3,
              total: '10000+',
              hasNext: true,
              onNext: () => {},
              onLoadMore: () => {},
            }}
          />
          <p className="text-caption text-text-secondary" data-testid="table-state">
            {c.table.selected}: {formatNumber(selection.size)}
            {opened && ` · ${c.table.openRow}: ${opened}`}
          </p>
        </Section>

        <Section id="overlay" title={c.sections.overlay}>
          <Row>
            <Button variant="secondary" onPress={() => setModalOpen(true)}>
              {c.overlay.openModal}
            </Button>
            <Button variant="secondary" onPress={() => setDrawerOpen(true)}>
              {c.overlay.openDrawer}
            </Button>
            <Button variant="danger" onPress={() => setConfirmOpen(true)}>
              {c.overlay.openConfirm}
            </Button>
          </Row>
          {confirmResult && (
            <p data-testid="confirm-result">{c.overlay.confirmed + confirmResult}</p>
          )}
          <Modal
            title={c.overlay.modalTitle}
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            secondaryAction={
              <Button variant="secondary" onPress={() => setModalOpen(false)}>
                {exampleMessages[locale].common.cancel}
              </Button>
            }
            primaryAction={<Button onPress={() => setModalOpen(false)}>{c.overlay.unlock}</Button>}
          >
            <PhoneField label={c.overlay.newValue} />
          </Modal>
          <Drawer
            title={c.overlay.drawerTitle}
            isOpen={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            footer={<Button onPress={() => setDrawerOpen(false)}>{c.overlay.apply}</Button>}
          >
            <Select label={c.select.district} options={districtOptions} />
            <DateField label={c.select.date} />
          </Drawer>
          <ConfirmDialog
            isOpen={confirmOpen}
            tone="danger"
            title={c.overlay.confirmTitle}
            message={c.overlay.confirmMessage}
            consequence={[c.overlay.confirmConsequence]}
            reasonRequired
            confirmLabel={c.overlay.confirmLabel}
            onConfirm={(reason) => {
              setConfirmResult(reason);
              setConfirmOpen(false);
            }}
            onCancel={() => setConfirmOpen(false)}
          />
        </Section>

        <Section id="alert" title={c.sections.alert}>
          <Alert tone="info" title={c.alert.infoTitle}>
            <p>{c.alert.infoText}</p>
          </Alert>
          <Alert tone="success" title={c.alert.successTitle} onDismiss={() => {}} />
          <Alert
            tone="warning"
            title={c.alert.warningTitle}
            action={
              <Button variant="ghost" size="sm">
                {c.alert.action}
              </Button>
            }
          >
            <p>{c.alert.warningText}</p>
          </Alert>
          <Alert tone="danger" title={c.alert.dangerTitle}>
            <p>{c.alert.dangerText}</p>
          </Alert>
        </Section>

        <Section id="tabs" title={c.sections.tabs}>
          <Tabs
            label={c.tabs.label}
            items={[
              { id: 'answers', label: c.tabs.answers, content: <p>{c.tabs.answersBody}</p> },
              {
                id: 'history',
                label: c.tabs.history,
                count: 4,
                content: <p>{c.tabs.historyBody}</p>,
              },
              { id: 'changes', label: c.tabs.changes, content: <p>{c.tabs.changesBody}</p> },
            ]}
          />
          <Tabs
            label={c.tabs.segmentedLabel}
            variant="segmented"
            items={[
              { id: 'list', label: c.tabs.list, content: null },
              { id: 'map', label: c.tabs.map, content: null },
            ]}
          />
          <Tabs
            label={c.tabs.manyLabel}
            items={Object.values(c.sections)
              .slice(0, 7)
              .map((label, i) => ({ id: `m${i}`, label, content: <p>{label}</p> }))}
          />
        </Section>

        <Section id="breadcrumb" title={c.sections.breadcrumb}>
          <Breadcrumb
            items={[
              { id: 'p', label: c.breadcrumb[0], href: '#breadcrumb' },
              { id: 'w', label: c.breadcrumb[1], href: '#breadcrumb' },
              { id: 'a', label: c.breadcrumb[2] },
            ]}
          />
        </Section>

        <Section id="states" title={c.sections.states}>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <EmptyState
                title={c.states.emptyTitle}
                message={c.states.emptyText}
                action={<Button icon={Plus}>{c.states.emptyAction}</Button>}
              />
            </Card>
            <Card>
              <Skeleton shape="row" count={3} />
            </Card>
            <Card>
              <ErrorState
                title={c.states.errorTitle}
                message={retried ? c.states.retried : c.states.errorText}
                requestId="req-01JA7F3K2Q"
                onRetry={() => setRetried(true)}
              />
            </Card>
          </div>
        </Section>

        <Section id="offline" title={c.sections.offline}>
          <OfflineBanner state="offline" pendingCount={7} onOpenOutbox={() => {}} />
          <OfflineBanner state="syncing" pendingCount={3} />
          <OfflineBanner state="sync_failed" pendingCount={2} onOpenOutbox={() => {}} />
        </Section>

        <Section id="bulk" title={c.sections.bulk}>
          <BulkList
            label={c.bulk.label}
            selectAllLabel={c.bulk.selectAll}
            allSelected={bulkSelected.size === bulkRows.length}
            someSelected={bulkSelected.size > 0}
            onSelectAll={(on) =>
              setBulkSelected(on ? new Set(bulkRows.map((r) => `b${r.id.slice(1)}`)) : new Set())
            }
            selectedCount={bulkSelected.size}
          >
            {bulkRows.map((r, i) => {
              const key = `b${r.id.slice(1)}`;
              return (
                <BulkRow
                  key={key}
                  title={r.name}
                  meta={`${r.number} · ${r.village}`}
                  selected={bulkSelected.has(key)}
                  onSelect={(on) =>
                    setBulkSelected((set) => {
                      const next = new Set(set);
                      if (on) next.add(key);
                      else next.delete(key);
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
                  quickAction={{ label: c.bulk.distributed, onPress: () => {} }}
                  menuActions={[
                    { id: 'absent', label: c.bulk.absent, onAction: () => {} },
                    { id: 'later', label: c.bulk.later, onAction: () => {} },
                    { id: 'not', label: c.bulk.notDistributed, onAction: () => {} },
                    { id: 'damaged', label: c.bulk.damaged, onAction: () => {} },
                    { id: 'partial', label: c.bulk.partial, onAction: () => {} },
                  ]}
                  expanded={i === 0 && expanded}
                  onExpandedChange={i === 0 ? setExpanded : undefined}
                >
                  {i === 0 ? <p className="m-0">{c.bulk.quantity}</p> : undefined}
                </BulkRow>
              );
            })}
          </BulkList>
        </Section>

        <Section id="timeline" title={c.sections.timeline}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Timeline
              label={c.timeline.label}
              showActor
              steps={[
                {
                  id: 's1',
                  title: c.timeline.submitted,
                  actor: c.timeline.actor1,
                  time: '02-10-2026 10:30 AM',
                  status: 'done',
                },
                {
                  id: 's2',
                  title: c.timeline.review,
                  actor: c.timeline.actor2,
                  time: '05-10-2026 03:15 PM',
                  status: 'done',
                  comment: c.timeline.comment,
                },
                { id: 's3', title: c.timeline.approval, status: 'current', time: '06-10-2026' },
                { id: 's4', title: c.timeline.distribution, status: 'upcoming' },
              ]}
            />
            <Timeline
              label={c.timeline.stagesLabel}
              orientation="horizontal"
              steps={c.timeline.stages.map((title, i) => ({
                id: `h${i}`,
                title,
                status: i < 1 ? 'done' : i === 1 ? 'current' : 'upcoming',
              }))}
            />
          </div>
        </Section>

        <Section id="progress" title={c.sections.progress}>
          <ProgressBar label={c.progress.quota} value={1240} max={2000} />
          <ProgressBar label={c.progress.budget} value={460000} max={500000} tone="warning" />
          <ProgressBar
            label={c.progress.over}
            value={520000}
            max={500000}
            tone="danger"
            size="sm"
          />
          <ProgressBar
            label={c.progress.buckets}
            value={450000}
            max={500000}
            segments={[
              { label: c.progress.spent, value: 300000 },
              { label: c.progress.advance, value: 100000 },
              { label: c.progress.returned, value: 20000 },
              { label: c.progress.claimed, value: 30000 },
            ]}
          />
        </Section>

        <Section id="misc" title={c.sections.misc}>
          <Row>
            <Avatar name={c.misc.person} decorative={false} />
            <Avatar name="Karim Uddin" size="sm" decorative={false} />
            <Avatar name={c.misc.person} size="lg" decorative={false} />
            <Spinner />
            <Icon icon={TriangleAlert} label={c.misc.icon} />
          </Row>
        </Section>
      </div>
    </main>
  );
}
