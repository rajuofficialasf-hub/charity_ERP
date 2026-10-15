import { programCode } from '@css/shared/projects';
import { Alert, Button, Modal, Switch, TextField } from '@css/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { type PanelUser, UserSearch } from '../UserSearch';
import { assignPm, createProgram, type Program, updateProgram } from './programs-api';

/**
 * Creates a program (code, name in both languages, an optional PM) or edits one: its name, whether
 * it is active, and its PM. A program is never deleted; the server refuses to deactivate one with
 * an open project and to give it a PM without the Program Manager role.
 */
export function ProgramDialog({
  program,
  isOpen,
  onClose,
  onDone,
}: {
  /** The program to edit; absent for a new one. */
  program?: Program;
  isOpen: boolean;
  onClose: () => void;
  onDone: (program: Program) => void;
}) {
  const t = useTranslations('admin.programs.dialog');
  const tc = useTranslations('common.action');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string>();
  const [nameBn, setNameBn] = useState(program?.name.bn ?? '');
  const [nameEn, setNameEn] = useState(program?.name.en ?? '');
  const [active, setActive] = useState(program?.active ?? true);
  const [pm, setPm] = useState<PanelUser | null>(
    program?.pmUserId
      ? { id: program.pmUserId, displayName: program.pmName ?? '', designation: null, roles: [] }
      : null,
  );
  const save = useMutation({
    mutationFn: async () => {
      const name = { bn: nameBn.trim(), en: nameEn.trim() };
      if (!program) return createProgram({ code, name, ...(pm ? { pmUserId: pm.id } : {}) });
      let saved = program;
      const renamed = name.bn !== program.name.bn || name.en !== program.name.en;
      if (renamed || active !== program.active)
        saved = await updateProgram(program.id, {
          ...(renamed ? { name } : {}),
          ...(active !== program.active ? { active } : {}),
        });
      if (pm && pm.id !== program.pmUserId) saved = await assignPm(program.id, pm.id);
      return saved;
    },
    onSuccess: onDone,
  });
  const submit = () => {
    if (!program && !programCode.safeParse(code).success) {
      setCodeError(t('code_invalid'));
      return;
    }
    setCodeError(undefined);
    save.mutate();
  };
  const ready = nameBn.trim() !== '' && nameEn.trim() !== '' && (program || code !== '');
  return (
    <Modal
      title={program ? t('edit_title', { code: program.code }) : t('create_title')}
      isOpen={isOpen}
      onClose={onClose}
      dismissible={!save.isPending}
      secondaryAction={
        <Button variant="secondary" onPress={onClose} disabled={save.isPending}>
          {tc('cancel')}
        </Button>
      }
      primaryAction={
        <Button onPress={submit} disabled={!ready} loading={save.isPending}>
          {tc('save')}
        </Button>
      }
    >
      {save.error instanceof ApiFailure && (
        <Alert tone="danger" live="alert">
          {save.error.details[0]?.message ?? save.error.message}
        </Alert>
      )}
      {!program && (
        <TextField
          label={t('code')}
          helper={t('code_hint')}
          required
          maxLength={12}
          value={code}
          onChange={setCode}
          error={codeError}
        />
      )}
      <TextField
        label={t('name_bn')}
        required
        maxLength={200}
        value={nameBn}
        onChange={setNameBn}
      />
      <TextField
        label={t('name_en')}
        required
        maxLength={200}
        lang="en"
        value={nameEn}
        onChange={setNameEn}
      />
      <UserSearch label={t('pm')} helper={t('pm_hint')} selected={pm} onSelect={setPm} />
      {program && (
        <Switch isSelected={active} onChange={setActive}>
          {t('active')}
        </Switch>
      )}
    </Modal>
  );
}
