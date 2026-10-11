/* eslint-disable security/detect-non-literal-fs-filename -- paths are the configured root plus keys checked by assertKey; test driver only */
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { assertKey, type Bucket, NotFoundError, type StorageDriver } from '../types';

/**
 * Filesystem driver for automated tests (ADR-005): objects are files under a root folder, each
 * with a `.meta.json` beside it. Never used in production (the configuration refuses it).
 */
export function createFilesystemDriver(root: string): StorageDriver {
  const path = (bucket: Bucket, key: string): string => {
    assertKey(key);
    return join(root, bucket, ...key.split('/'));
  };

  return {
    name: 'filesystem',

    async put(bucket, key, body, meta) {
      const file = path(bucket, key);
      await mkdir(dirname(file), { recursive: true });
      await pipeline(body, createWriteStream(file));
      await writeFile(`${file}.meta.json`, JSON.stringify({ contentType: meta.contentType }));
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
        const meta = JSON.parse(await readFile(`${file}.meta.json`, 'utf8')) as {
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
      await rm(`${file}.meta.json`, { force: true });
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
