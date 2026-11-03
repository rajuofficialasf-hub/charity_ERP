// @vitest-environment jsdom
// The file upload this app added to the asf template (listed in local.json): the pickers by source,
// the type and size checks, and each file's state.
import '@testing-library/jest-dom/vitest';

import type { UploadItem, FileUploadProps } from '@/ui/contract';

import userEvent from '@testing-library/user-event';
import { vi, it, expect, describe, afterEach, beforeEach } from 'vitest';
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react';

import { FileUpload, UiProvider } from './index';
import { resetPage, stubWidth, expectNoAxeViolations } from './local-test-support';

beforeEach(() => stubWidth(false));

afterEach(() => {
  cleanup();
  resetPage();
});

const photo = (name: string, bytes = 1000, type = 'image/jpeg') => new File([new Uint8Array(bytes)], name, { type });

function Upload(props: Partial<FileUploadProps>) {
  return (
    <UiProvider>
      <FileUpload label="House photos" value={[]} onAdd={() => {}} accept={['image/jpeg', 'image/png']} maxSize={5000} maxSizeText="5 KB" {...props} />
    </UiProvider>
  );
}

describe('the file upload', () => {
  it('offers the camera and the gallery, the camera asking for the back one', () => {
    render(<Upload source="camera_or_gallery" />);
    const group = screen.getByRole('group', { name: 'House photos' });
    expect(within(group).getByRole('button', { name: 'Take photo' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Choose from gallery' })).toBeInTheDocument();
    expect(screen.getByLabelText('Take photo', { selector: 'input' })).toHaveAttribute('capture', 'environment');
    expect(screen.getByLabelText('Choose from gallery', { selector: 'input' })).not.toHaveAttribute('capture');
  });

  it('hands over the files that pass, and says why the others do not', async () => {
    // the picker's own type filter is off, so the check of the piece itself is what is tested
    const user = userEvent.setup({ applyAccept: false });
    const onAdd = vi.fn();
    const onReject = vi.fn();
    render(<Upload source="file" multiple onAdd={onAdd} onReject={onReject} />);
    await user.upload(screen.getByLabelText('Choose file', { selector: 'input' }), [photo('door.jpg'), photo('big.jpg', 9000), photo('notes.exe', 10, 'application/x-msdownload')]);
    expect(onAdd).toHaveBeenCalledWith([expect.objectContaining({ name: 'door.jpg' })]);
    expect(onReject).toHaveBeenCalledWith(expect.objectContaining({ name: 'big.jpg' }), 'big.jpg is larger than 5 KB');
    expect(onReject).toHaveBeenCalledWith(expect.objectContaining({ name: 'notes.exe' }), 'notes.exe: this file type is not accepted');
  });

  it('takes no more than the files left, and counts them', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const value: UploadItem[] = [{ id: 'f1', name: 'one.jpg', state: 'ready' }];
    render(<Upload source="gallery" multiple maxFiles={2} value={value} onAdd={onAdd} />);
    expect(screen.getByText('1 of 2 files')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Choose from gallery', { selector: 'input' }), [photo('two.jpg'), photo('three.jpg')]);
    expect(onAdd).toHaveBeenCalledWith([expect.objectContaining({ name: 'two.jpg' })]);
  });

  it('takes files dropped on it', () => {
    const onAdd = vi.fn();
    render(<Upload source="file" onAdd={onAdd} />);
    fireEvent.drop(screen.getByText('or drop files here'), { dataTransfer: { files: [photo('dropped.png', 100, 'image/png')] } });
    expect(onAdd).toHaveBeenCalledWith([expect.objectContaining({ name: 'dropped.png' })]);
  });

  it('shows each file with its state, its progress, and what can be done with it', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const onRetry = vi.fn();
    const value: UploadItem[] = [
      { id: 'a', name: 'door.jpg', state: 'uploading', progress: 40, previewUrl: 'blob:door', meta: '3 Nov 2026, 10:12 · Mirpur', removable: true },
      { id: 'b', name: 'roof.jpg', state: 'failed', reason: 'The network dropped' },
      { id: 'c', name: 'wall.jpg', state: 'ready' },
    ];
    render(<Upload value={value} onRemove={onRemove} onRetry={onRetry} />);
    const files = within(screen.getByRole('list', { name: 'House photos' })).getAllByRole('listitem');
    expect(within(files[0]!).getByText('Uploading')).toBeInTheDocument();
    expect(within(files[0]!).getByRole('progressbar', { name: 'door.jpg' })).toHaveAttribute('aria-valuenow', '40');
    expect(within(files[0]!).getByText('3 Nov 2026, 10:12 · Mirpur')).toBeInTheDocument();
    await user.click(within(files[0]!).getByRole('button', { name: 'Remove door.jpg' }));
    expect(onRemove).toHaveBeenCalledWith('a');
    expect(within(files[1]!).getByText('The network dropped')).toBeInTheDocument();
    await user.click(within(files[1]!).getByRole('button', { name: 'Upload again' }));
    expect(onRetry).toHaveBeenCalledWith('b');
    expect(within(files[2]!).getByText('Ready')).toBeInTheDocument();
    expect(within(files[2]!).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows its error and stays closed while disabled', () => {
    render(<Upload source="file" error="Add at least one photo" disabled />);
    expect(screen.getByText('Add at least one photo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeDisabled();
  });

  it.each(['light', 'dark'] as const)('passes axe, %s', async (mode) => {
    window.localStorage.setItem('asf-mode', mode);
    const value: UploadItem[] = [
      { id: 'a', name: 'door.jpg', state: 'uploading', progress: 40, removable: true },
      { id: 'b', name: 'roof.jpg', state: 'failed', reason: 'The network dropped' },
    ];
    const { container } = render(<Upload source="camera_or_gallery" value={value} onRemove={() => {}} onRetry={() => {}} hint="JPEG or PNG" />);
    await expectNoAxeViolations(container);
  });
});
