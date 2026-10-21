import { PHOTO_MAX_BYTES } from '@css/shared/registration';
import { maxSizeOf, UPLOAD_RULES } from '@css/shared/files';
import express, { type RequestHandler } from 'express';
import { ApiError } from '../i18n/api-error';

const raw = express.raw({ type: ['image/jpeg', 'image/png'], limit: PHOTO_MAX_BYTES });

/**
 * The raw photo body of the upload routes only (NE-REQ-02): JPEG or PNG headers, at most 2 MB, so
 * the JSON limit of every other route stays small. A larger body answers 413 `file.too_large`;
 * any other type leaves no body and the service answers 415 after the magic-byte check.
 */
export const photoBody: RequestHandler = (req, res, next) => {
  raw(req, res, (error?: unknown) => {
    if ((error as { type?: string } | undefined)?.type === 'entity.too.large')
      return next(new ApiError('file.too_large', 413));
    next(error);
  });
};

const rawFormPhoto = express.raw({
  type: ['image/jpeg', 'image/png'],
  limit: maxSizeOf('form_photo', 'image/jpeg') ?? 0,
});

/** The raw photo body of the public form's photo route: the form photo kind's size, JPEG or PNG. */
export const formPhotoBody: RequestHandler = (req, res, next) => {
  rawFormPhoto(req, res, (error?: unknown) => {
    if ((error as { type?: string } | undefined)?.type === 'entity.too.large')
      return next(new ApiError('file.too_large', 413));
    next(error);
  });
};

const rawPart = express.raw({ type: 'application/octet-stream', limit: UPLOAD_RULES.partSize });

/**
 * The raw body of one part of a chunked upload: at most 256 KB of bytes, whatever they are (the
 * type is decided from the joined file at finalize). A larger body answers 413 `file.too_large`.
 */
export const partBody: RequestHandler = (req, res, next) => {
  rawPart(req, res, (error?: unknown) => {
    if ((error as { type?: string } | undefined)?.type === 'entity.too.large')
      return next(new ApiError('file.too_large', 413));
    next(error);
  });
};
