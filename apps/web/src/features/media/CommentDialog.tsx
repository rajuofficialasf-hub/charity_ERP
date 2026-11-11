import { Dialog, Form, FormTextField } from '@/ui';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { DialogButtons } from '../../components/DialogButtons';
import { useSchemaResolver } from '../../lib/form-schema';

/** A comment or reason the server keeps: written, at most 2000 characters. */
const COMMENT_SCHEMA = z.object({ comment: z.string().trim().min(1).max(2000) });
type CommentFields = z.infer<typeof COMMENT_SCHEMA>;

/**
 * Asks for the comment a decision carries (a referral sent back or rejected, a work sent back at
 * the final review) and hands it over trimmed; the caller sends it and hands back its pending
 * state and refusal. The comment starts empty each time the dialog opens.
 */
export function CommentDialog({
  title,
  label,
  confirmLabel,
  danger = false,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  label: string;
  confirmLabel: string;
  danger?: boolean;
  pending: boolean;
  /** The refusal of the last attempt, in the reader's words. */
  error?: string;
  onConfirm: (comment: string) => void;
  onClose: () => void;
}) {
  const form = useForm<CommentFields>({
    resolver: useSchemaResolver(COMMENT_SCHEMA),
    defaultValues: { comment: '' },
    reValidateMode: 'onSubmit',
  });
  const ready = COMMENT_SCHEMA.safeParse(useWatch({ control: form.control })).success;
  // the button's own path: nothing it would refuse, and nothing twice while one is on its way
  const send = ({ comment }: CommentFields) => {
    if (ready && !pending) onConfirm(comment.trim());
  };
  return (
    <Dialog
      title={title}
      size="small"
      open
      onClose={onClose}
      dismissible={!pending}
      actions={
        <DialogButtons
          onCancel={onClose}
          onConfirm={() => void form.handleSubmit(send)()}
          confirmLabel={confirmLabel}
          disabled={!ready}
          pending={pending}
          danger={danger}
        />
      }
    >
      <Form form={form} onSubmit={send} label={title} error={error}>
        <FormTextField name="comment" rows={4} label={label} required maxLength={2000} />
      </Form>
    </Dialog>
  );
}
