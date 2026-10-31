import { isoDateInDhaka } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { PUBLICATION_STATES, type PublicationState } from '@css/shared/media';
import {
  Alert,
  Badge,
  Button,
  Card,
  DateField,
  Grid,
  Modal,
  Select,
  Stack,
  Text,
  TextArea,
  TextField,
} from '@css/ui';
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
      actions={
        work.mayManage ? (
          <Button variant="secondary" size="sm" onPress={() => setEditing({})}>
            {t('work.add_publication')}
          </Button>
        ) : null
      }
    >
      <Stack gap={2}>
        {work.publications.length ? (
          <Grid gap={2} as="ul" role="list" className="media-link-cards">
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
                    <Badge tone={STATE_TONE[p.state]} label={t(`publication_state.${p.state}`)} />
                    {work.mayManage ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => setEditing({ publication: p })}
                      >
                        {t('work.edit_publication', { platform: labels.platform(p.platformCode) })}
                      </Button>
                    ) : null}
                  </Stack>
                  {p.note ? <Text as="small">{p.note}</Text> : null}
                </WorkLinkCard>
              </li>
            ))}
          </Grid>
        ) : (
          <Text tone="muted">{t('work.no_publications')}</Text>
        )}
        <Text as="small" tone="muted">
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
    <Modal
      title={
        publication
          ? t('work.edit_publication', { platform: labels.platform(publication.platformCode) })
          : t('work.add_publication')
      }
      isOpen
      onClose={onClose}
      dismissible={!save.isPending}
      secondaryAction={
        <Button variant="secondary" onPress={onClose} disabled={save.isPending}>
          {tc('action.cancel')}
        </Button>
      }
      primaryAction={
        <Button onPress={() => save.mutate()} disabled={!ready} loading={save.isPending}>
          {tc('action.save')}
        </Button>
      }
    >
      {failure ? (
        <Alert tone="danger" live="alert">
          {failure}
        </Alert>
      ) : null}
      {needsLink && !work.reviewApprovedBy ? (
        <Alert tone="warning">{t('work.review_hint')}</Alert>
      ) : null}
      <Select
        label={t('work.platform')}
        required
        disabled={!!publication}
        value={platform}
        options={platforms.map((p) => ({ id: p.code, label: localized(p.label, locale) }))}
        onChange={setPlatform}
      />
      <Select
        label={t('work.publication_state')}
        required
        value={state}
        options={PUBLICATION_STATES.map((s) => ({ id: s, label: t(`publication_state.${s}`) }))}
        onChange={(id) => id && setState(id as PublicationState)}
      />
      <TextField
        label={t('work.link')}
        helper={t('work.link_hint')}
        required={needsLink}
        lang="en"
        maxLength={500}
        value={link}
        onChange={setLink}
      />
      <DateField
        label={t('work.published_on')}
        required={needsLink}
        value={date}
        onChange={setDate}
      />
      <TextArea
        label={t('work.publication_note')}
        maxLength={2000}
        value={note}
        onChange={setNote}
      />
    </Modal>
  );
}
