import { type FormDefinition, type FormField, isCoreFieldKey } from '@css/shared/forms';
import { Alert, Badge, Stack, Text } from '@css/ui';
import { Lock } from 'lucide-react';
import { useLocale, useTranslations } from 'use-intl';
import { coreLocks } from './draft';
import { RowButtons } from './RowButtons';

/** What the outline may change: everything on a computer, only texts on a phone, nothing read-only. */
export type OutlineMode = 'full' | 'texts' | 'read';

export interface Selection {
  section: string;
  field?: string;
}

/**
 * The form's outline: each section with its questions in order, the move and remove buttons, and
 * the button that opens a section's or a question's settings. A core field is marked locked and
 * has no remove button.
 */
export function OutlinePane({
  definition,
  mode,
  errors,
  selected,
  onSelect,
  onMoveSection,
  onMoveField,
  onRemoveSection,
  onRemoveField,
}: {
  definition: FormDefinition;
  mode: OutlineMode;
  errors: Record<string, string>;
  selected: Selection | null;
  onSelect: (selection: Selection) => void;
  onMoveSection: (key: string, direction: -1 | 1) => void;
  onMoveField: (section: string, field: string, direction: -1 | 1) => void;
  onRemoveSection: (key: string) => void;
  onRemoveField: (field: string) => void;
}) {
  const t = useTranslations('forms.builder');
  const tt = useTranslations('forms.types');
  const locale = useLocale();
  const full = mode === 'full';
  const canEdit = mode !== 'read';
  const row = (section: string, field: FormField, index: number, count: number) => {
    const label = field.label[locale];
    const locks = coreLocks(field);
    const member = field.settings?.repeat?.group !== undefined;
    return (
      <li
        key={field.fieldKey}
        className={selected?.field === field.fieldKey ? 'is-selected' : undefined}
      >
        <Stack gap={1}>
          <Stack direction="row" gap={2} wrap align="center" justify="between">
            <Stack gap={0}>
              <Text weight="bold">{member ? `↳ ${label}` : label}</Text>
              <Text tone="muted">{tt(field.type)}</Text>
            </Stack>
            <RowButtons
              edit={
                canEdit
                  ? {
                      label: t('edit', { label }),
                      onPress: () => onSelect({ section, field: field.fieldKey }),
                    }
                  : undefined
              }
              up={
                full
                  ? {
                      label: t('move_up', { label }),
                      disabled: index === 0,
                      onPress: () => onMoveField(section, field.fieldKey, -1),
                    }
                  : undefined
              }
              down={
                full
                  ? {
                      label: t('move_down', { label }),
                      disabled: index === count - 1,
                      onPress: () => onMoveField(section, field.fieldKey, 1),
                    }
                  : undefined
              }
              remove={
                full && !locks.remove
                  ? { label: t('remove', { label }), onPress: () => onRemoveField(field.fieldKey) }
                  : undefined
              }
            />
          </Stack>
          {isCoreFieldKey(field.fieldKey) ? (
            <Text tone="muted">
              <Lock size={14} aria-hidden="true" /> {t('core')}
            </Text>
          ) : null}
          {errors[field.fieldKey] ? <Alert tone="danger">{errors[field.fieldKey]}</Alert> : null}
        </Stack>
      </li>
    );
  };
  return (
    <Stack as="section" gap={3} aria-label={t('outline')}>
      <Text weight="bold">{t('outline')}</Text>
      {definition.sections.map((s, i) => {
        const title = s.title[locale];
        const core = s.fields.some((f) => isCoreFieldKey(f.fieldKey));
        return (
          <Stack key={s.key} gap={2} className="form-outline-section">
            <Stack direction="row" gap={2} wrap align="center" justify="between">
              <Stack direction="row" gap={2} align="center">
                <Text weight="bold">{title}</Text>
                {s.visibility === 'official_only' ? (
                  <Badge size="sm" label={t('official_only')} />
                ) : null}
              </Stack>
              <RowButtons
                edit={
                  canEdit
                    ? {
                        label: t('edit', { label: title }),
                        onPress: () => onSelect({ section: s.key }),
                      }
                    : undefined
                }
                up={
                  full
                    ? {
                        label: t('move_up', { label: title }),
                        disabled: i === 0,
                        onPress: () => onMoveSection(s.key, -1),
                      }
                    : undefined
                }
                down={
                  full
                    ? {
                        label: t('move_down', { label: title }),
                        disabled: i === definition.sections.length - 1,
                        onPress: () => onMoveSection(s.key, 1),
                      }
                    : undefined
                }
                remove={
                  full && !core
                    ? {
                        label: t('remove', { label: title }),
                        onPress: () => onRemoveSection(s.key),
                      }
                    : undefined
                }
              />
            </Stack>
            {errors[s.key] ? <Alert tone="danger">{errors[s.key]}</Alert> : null}
            <ul aria-label={title} className="form-outline-list">
              {s.fields.map((f, j) => row(s.key, f, j, s.fields.length))}
            </ul>
          </Stack>
        );
      })}
    </Stack>
  );
}
