import { isoDateInDhaka } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { PUBLICATION_STATES, type PublicationState } from '@css/shared/media';
import {
  Alert,
  Button,
  Card,
  Chip,
  DateField,
  Dialog,
  SelectField,
  Stack,
  Text,
  TextField,
} from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import {
  addPublication,
  type MediaPublication,
  type MediaReferral,
  type MediaWork,
  updatePublication,
} from './media-api';
import { useMediaLabels } from './use-media-lists';
import { WorkLinkCard } from './WorkLinkCard';
import { failureOf } from './work-errors';
import { DialogButtons } from '../../components/DialogButtons';

const STATE_TONE: Record<PublicationState, 'neutral' | 'success' | 'warning'> = {
  waiting: 'neutral',
  published: 'success',
  taken_down: 'warning',
};

/**
 * Where a work was published: a card per platform with its state, and for whoever runs the work a
 * publication added or changed in a dialog. A post is marked published only after the final
 * review; the first one makes the work "published" by itself.
 */
export function PublicationsPanel({
  work,
  onSaved,
}: {
  work: MediaWork;
  onSaved: (next: MediaReferral, text: string) => void;
}) {
  const t = useTranslations('media');
  const labels = useMediaLabels();
  const [editing, setEditing] = useState<{ publication?: MediaPublication } | null>(null);
  return (
    <Card
      title={t('work.publications')}
      headingLevel={2}
      action={
        work.mayManage ? (
          <Button variant="secondary" size="small" onClick={() => setEditing({})}>
            {t('work.add_publication')}
          </Button>
        ) : null
      }
    >
      <Stack gap={2}>
        {work.publications.length ? (
          <ul className="media-link-cards">
            {work.publications.map((p) => (
              <li key={p.id}>
                <WorkLinkCard
                  title={labels.platform(p.platformCode)}
                  platformCode={p.platformCode}
                  link={p.link}
                  publishedOn={p.publishedOn}
                  youtubeId={p.youtubeId}
                >
                  <Stack direction="row" gap={2} wrap align="center">
                    <Chip tone={STATE_TONE[p.state]}>{t(`publication_state.${p.state}`)}</Chip>
                    {work.mayManage ? (
                      <Button
                        variant="text"
                        size="small"
                        onClick={() => setEditing({ publication: p })}
                      >
                        {t('work.edit_publication', { platform: labels.platform(p.platformCode) })}
                      </Button>
                    ) : null}
                  </Stack>
                  {p.note ? <Text size="small">{p.note}</Text> : null}
                </WorkLinkCard>
              </li>
            ))}
          </ul>
        ) : (
          <Text tone="muted">{t('work.no_publications')}</Text>
        )}
        <Text size="small" tone="muted">
          {t('work.files_note')}
        </Text>
      </Stack>
      {editing ? (
        <PublicationDialog
          work={work}
          publication={editing.publication}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            setEditing(null);
            onSaved(next, t('work.publication_saved'));
          }}
        />
      ) : null}
    </Card>
  );
}

function PublicationDialog({
  work,
  publication,
  onClose,
  onSaved,
}: {
  work: MediaWork;
  publication?: MediaPublication;
  onClose: () => void;
  onSaved: (next: MediaReferral) => void;
}) {
  const t = useTranslations('media');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const labels = useMediaLabels();
  const [platform, setPlatform] = useState<string | null>(publication?.platformCode ?? null);
  const [state, setState] = useState<PublicationState>(publication?.state ?? 'waiting');
  const [date, setDate] = useState<string | null>(
    publication?.publishedOn ?? isoDateInDhaka(new Date()),
  );
  const [link, setLink] = useState(publication?.link ?? '');
  const [note, setNote] = useState(publication?.note ?? '');
  const save = useMutation({
    mutationFn: () => {
      const given = {
        state,
        ...(date && (state !== 'waiting' || link.trim()) ? { publishedOn: date } : {}),
        ...(link.trim() ? { link: link.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      // an emptied link or note of a stored publication is cleared, not kept
      return publication
        ? updatePublication(publication.id, {
            ...given,
            ...(!link.trim() && publication.link ? { link: null } : {}),
            ...(!note.trim() && publication.note ? { note: null } : {}),
          })
        : addPublication(work.id, { platformCode: platform ?? '', ...given });
    },
    onSuccess: onSaved,
  });
  const failure = save.error
    ? failureOf(save.error, { stale: t('work.stale'), fallback: tc('state.error.text') }).text
    : null;
  const needsLink = state === 'published';
  const ready = !!platform && (!needsLink || (!!link.trim() && !!date));
  const platforms = labels.platforms.filter((p) => p.active || p.code === platform);
  return (
    <Dialog
      title={
        publication
          ? t('work.edit_publication', { platform: labels.platform(publication.platformCode) })
          : t('work.add_publication')
      }
      open
      onClose={onClose}
      dismissible={!save.isPending}
      actions={
        <DialogButtons
          onCancel={onClose}
          onConfirm={() => save.mutate()}
          confirmLabel={tc('action.save')}
          disabled={!ready}
          pending={save.isPending}
        />
      }
    >
      {failure ? <Alert tone="error">{failure}</Alert> : null}
      {needsLink && !work.reviewApprovedBy ? (
        <Alert tone="warning">{t('work.review_hint')}</Alert>
      ) : null}
      <SelectField
        label={t('work.platform')}
        required
        disabled={!!publication}
        value={platform ?? ''}
        options={platforms.map((p) => ({ value: p.code, label: localized(p.label, locale) }))}
        onChange={(v) => setPlatform(v || null)}
      />
      <SelectField
        label={t('work.publication_state')}
        required
        value={state}
        options={PUBLICATION_STATES.map((s) => ({ value: s, label: t(`publication_state.${s}`) }))}
        onChange={(id) => id && setState(id as PublicationState)}
      />
      <TextField
        label={t('work.link')}
        hint={t('work.link_hint')}
        required={needsLink}
        lang="en"
        maxLength={500}
        value={link}
        onChange={setLink}
      />
      <DateField
        label={t('work.published_on')}
        required={needsLink}
        value={date ?? ''}
        onChange={(v) => setDate(v || null)}
      />
      <TextField
        rows={4}
        label={t('work.publication_note')}
        maxLength={2000}
        value={note}
        onChange={setNote}
      />
    </Dialog>
  );
}
