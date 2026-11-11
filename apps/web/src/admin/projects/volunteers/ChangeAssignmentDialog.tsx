import { PERMISSION_SETS, permissionSetAllowed } from '@css/shared/projects';
import { Button, Dialog, Form, FormSelectField, Switch } from '@/ui';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { showFailure, useSchemaResolver } from '../../../lib/form-schema';
import { type Assignment, changeAssignment } from './project-volunteers-api';

/** One of the sets and the paid flag; the server checks the set against the volunteer's type. */
const CHANGE_SCHEMA = z.object({ permissionSet: z.enum(PERMISSION_SETS), isPaid: z.boolean() });
type ChangeFields = z.infer<typeof CHANGE_SCHEMA>;

/**
 * Changes one assignment's permission set (only the sets meant for the volunteer's type are
 * offered) and, for a caller who may, its paid flag.
 */
export function ChangeAssignmentDialog({
  assignment,
  markPaid,
  onClose,
  onDone,
}: {
  assignment: Assignment;
  markPaid: boolean;
  onClose: () => void;
  onDone: (changed: Assignment) => void;
}) {
  const t = useTranslations('admin.projects.volunteers');
  const td = useTranslations('admin.projects.volunteers.change_dialog');
  const tc = useTranslations('common.action');
  const ts = useTranslations('common.state.error');
  const form = useForm<ChangeFields>({
    resolver: useSchemaResolver(CHANGE_SCHEMA),
    defaultValues: { permissionSet: assignment.permissionSet, isPaid: assignment.isPaid },
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control });
  const pending = form.formState.isSubmitting;
  const changed =
    values.permissionSet !== assignment.permissionSet || values.isPaid !== assignment.isPaid;

  const save = async ({ permissionSet, isPaid }: ChangeFields) => {
    let saved: Assignment;
    try {
      saved = await changeAssignment(assignment.id, {
        ...(permissionSet !== assignment.permissionSet ? { permissionSet } : {}),
        ...(isPaid !== assignment.isPaid ? { isPaid } : {}),
      });
    } catch (failure) {
      showFailure(form, failure, ts('text'));
      return;
    }
    onDone(saved);
  };

  return (
    <Dialog
      title={td('title')}
      size="small"
      open
      onClose={onClose}
      dismissible={!pending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button
            onClick={() => void form.handleSubmit(save)()}
            disabled={!changed}
            loading={pending}
          >
            {tc('save')}
          </Button>
        </>
      }
    >
      <Form
        form={form}
        onSubmit={save}
        label={td('title')}
        error={form.formState.errors.root?.server?.message}
      >
        <p>{assignment.displayName}</p>
        <FormSelectField
          name="permissionSet"
          label={t('column.set')}
          searchable={false}
          options={PERMISSION_SETS.filter((s) => permissionSetAllowed(s, assignment.type)).map(
            (s) => ({ value: s, label: t(`set.${s}`) }),
          )}
        />
        {markPaid && (
          <Controller
            control={form.control}
            name="isPaid"
            render={({ field }) => (
              <Switch label={td('paid')} checked={field.value} onChange={field.onChange} />
            )}
          />
        )}
      </Form>
    </Dialog>
  );
}
