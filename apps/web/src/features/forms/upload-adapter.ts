/**
 * How a screen lets the renderer's photo, file and signature questions upload: the public page
 * sends one photo at a time to its link, a signed-in application uses the chunked upload. Without
 * an adapter (the builder's preview) those questions take nothing.
 */
export interface UploadAdapter {
  /** Sends one file of a question; `clientUuid` names the application it belongs to. */
  upload: (file: File, fieldKey: string, clientUuid: string) => Promise<{ fileId: string }>;
  /** Accepted MIME types, and the largest size in bytes, checked before anything is sent. */
  accept: string[];
  maxSize: number;
  /** Most files one question may hold. */
  maxFiles?: number;
  /** The text of a refused upload, from the API's error, in the reader's language. */
  reasonOf?: (error: unknown) => string;
}

/** The adapter as a question uses it: the renderer has already named the application. */
export type FieldUpload = Omit<UploadAdapter, 'upload'> & {
  upload: (file: File, fieldKey: string) => Promise<{ fileId: string }>;
};
