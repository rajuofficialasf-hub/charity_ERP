import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { ErrorSummary, Form, FormActions, FormGrid, FormSection } from '../Form/Form.js';
import { Button } from '../Button/Button.js';
import { TextField } from '../Field/TextField.js';
import { FileUpload, type UploadItem } from './FileUpload.js';

const items: UploadItem[] = [
  {
    id: '1',
    name: 'photo-1.jpg',
    state: 'uploading',
    progress: 40,
    meta: '11-10-2026 10:30 AM · GPS',
  },
  { id: '2', name: 'photo-2.jpg', state: 'failed', reason: 'Network lost' },
  { id: '3', name: 'voucher.pdf', state: 'quarantined', removable: false },
];

describe('File upload with preview (DESIGN_SYSTEM 5.12)', () => {
  it('offers camera and gallery per the project setting and the camera uses the back camera', () => {
    const { container } = renderWithUi(
      <FileUpload
        label="বিতরণের ছবি"
        source="camera_or_gallery"
        accept={['image/*']}
        value={[]}
        onAdd={() => {}}
      />,
      { locale: 'bn' },
    );
    expect(screen.getByRole('button', { name: 'ছবি তুলুন' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'গ্যালারি থেকে নিন' })).toBeInTheDocument();
    const inputs = container.querySelectorAll('input[type="file"]');
    expect(inputs[0]).toHaveAttribute('capture', 'environment');
    expect(inputs[1]).not.toHaveAttribute('capture');
  });

  it('passes accepted files on and rejects too large or wrong-type files with a reason', async () => {
    const onAdd = vi.fn();
    const onReject = vi.fn();
    const user = userEvent.setup({ applyAccept: false });
    const { container } = renderWithUi(
      <FileUpload
        label="Documents"
        multiple
        maxFiles={3}
        accept={['image/jpeg', 'application/pdf']}
        maxSize={1000}
        maxSizeText="1 KB"
        value={[]}
        onAdd={onAdd}
        onReject={onReject}
      />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [
      new File(['x'], 'ok.jpg', { type: 'image/jpeg' }),
      new File(['x'.repeat(2000)], 'big.pdf', { type: 'application/pdf' }),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
    ]);
    expect(onAdd).toHaveBeenCalledWith([expect.objectContaining({ name: 'ok.jpg' })]);
    expect(onReject).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'big.pdf' }),
      'big.pdf is larger than 1 KB',
    );
    expect(onReject).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'notes.txt' }),
      'notes.txt: this file type is not accepted',
    );
  });

  it('lists files with state, progress, retry and remove, announced politely', async () => {
    const onRemove = vi.fn();
    const onRetry = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <FileUpload
        label="Photos"
        multiple
        value={items}
        onAdd={() => {}}
        onRemove={onRemove}
        onRetry={onRetry}
        helper="Up to 3"
        maxFiles={3}
      />,
    );
    expect(container.querySelector('.ui-upload-list')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('progressbar', { name: 'photo-1.jpg' })).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
    expect(screen.getByText('Being checked')).toBeInTheDocument();
    expect(screen.getByText('Up to 3 · 3 of 3 files')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Upload again' }));
    expect(onRetry).toHaveBeenCalledWith('2');
    await user.click(screen.getByRole('button', { name: 'Remove photo-1.jpg' }));
    expect(onRemove).toHaveBeenCalledWith('1');
    expect(screen.queryByRole('button', { name: 'Remove voucher.pdf' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeDisabled(); // limit reached
    await expectNoAxeViolations(container);
  });
});

describe('Form layout and error summary (DESIGN_SYSTEM 6.3)', () => {
  it('groups fields in sections and moves focus to the error summary with links to the fields', async () => {
    const user = userEvent.setup();
    const { container } = renderWithUi(
      <Form aria-label="New application">
        <ErrorSummary errors={[{ fieldId: 'f-name', message: 'Enter the name' }]} />
        <FormSection title="Basic information" description="As on the NID">
          <FormGrid>
            <TextField id="f-name" label="Name" error="Enter the name" />
            <TextField id="f-father" label="Father's name" />
          </FormGrid>
        </FormSection>
        <FormActions>
          <Button variant="secondary">Save draft</Button>
          <Button type="submit">Submit</Button>
        </FormActions>
      </Form>,
    );
    expect(screen.getByRole('group', { name: 'Basic information' })).toBeInTheDocument();
    // A native submission before hydration never puts field values into the URL.
    expect(screen.getByRole('form', { name: 'New application' })).toHaveAttribute('method', 'post');
    const summary = screen.getByRole('alert');
    expect(summary).toHaveFocus();
    await user.click(screen.getByRole('link', { name: 'Enter the name' }));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    await expectNoAxeViolations(container);
  });
});
