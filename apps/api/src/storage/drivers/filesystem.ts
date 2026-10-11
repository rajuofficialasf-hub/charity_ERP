/* eslint-disable security/detect-non-literal-fs-filename -- paths are the configured root plus keys checked by assertKey; test driver only */
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ApiError } from '../../i18n/api-error';
import { assertKey, type Bucket, NotFoundError, type StorageDriver } from '../types';

const META_SUFFIX = '.meta.json';
const PART_SUFFIX = '.part';

/**
 * Filesystem driver for automated tests (ADR-005): objects are files under a root folder, each
 * with a `.meta.json` beside it; a put lands under a `.part` name and is renamed once complete,
 * so a read never sees a partial object (as S3 never does). Never used in production (the
 * configuration refuses it).
 */
export function createFilesystemDriver(root: string): StorageDriver {
  const path = (bucket: Bucket, key: string): string => {
    assertKey(key);
    if (key.endsWith(META_SUFFIX) || key.endsWith(PART_SUFFIX))
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'key', code: 'validation.failed' },
      ]);
    return join(root, bucket, ...key.split('/'));
  };

  return {
    name: 'filesystem',

    async put(bucket, key, body, meta) {
      const file = path(bucket, key);
      const part = `${file}${PART_SUFFIX}`;
      await mkdir(dirname(file), { recursive: true });
      try {
        await pipeline(body, createWriteStream(part));
        await writeFile(`${file}${META_SUFFIX}`, JSON.stringify({ contentType: meta.contentType }));
        await rename(part, file);
      } catch (error) {
        await rm(part, { force: true });
        throw error;
      }
    },

    async get(bucket, key) {
      const file = path(bucket, key);
      try {
        await stat(file);
      } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') throw new NotFoundError(bucket, key);
        throw error;
      }
      return createReadStream(file);
    },

    async stat(bucket, key) {
      const file = path(bucket, key);
      try {
        const info = await stat(file);
        const meta = JSON.parse(await readFile(`${file}${META_SUFFIX}`, 'utf8')) as {
          contentType?: string;
        };
        return { size: info.size, contentType: meta.contentType };
      } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') return null;
        throw error;
      }
    },

    async remove(bucket, key) {
      const file = path(bucket, key);
      await rm(file, { force: true });
      await rm(`${file}${META_SUFFIX}`, { force: true });
    },

    async ping() {
      try {
        await mkdir(root, { recursive: true });
        return true;
      } catch {
        return false;
      }
    },
  };
}
