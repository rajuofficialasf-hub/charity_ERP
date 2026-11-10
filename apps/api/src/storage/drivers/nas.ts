/* eslint-disable security/detect-non-literal-fs-filename -- every path is the configured root plus a known bucket and a key checked by assertKey, then confirmed inside the root by its real path */
import { randomUUID } from 'node:crypto';
import { constants, createReadStream, createWriteStream } from 'node:fs';
import { access, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { ApiError } from '../../i18n/api-error';
import { assertKey, BUCKETS, type Bucket, NotFoundError, type StorageDriver } from '../types';

const META_SUFFIX = '.meta.json';
const PART_SUFFIX = '.part';
const Meta = z.object({ contentType: z.string().optional() });

function refused(): ApiError {
  return new ApiError('validation.failed', 422, undefined, [
    { path: 'key', code: 'validation.failed' },
  ]);
}

function isMissing(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/** True when `path` is the root or lies below it. */
function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** The real path of the deepest folder of `path` that exists, links followed. */
async function deepestReal(path: string): Promise<string> {
  let current = path;
  for (;;) {
    try {
      return await realpath(current);
    } catch (error) {
      if (!isMissing(error)) throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

/**
 * The organization's NAS, mounted at STORAGE_ROOT: an object is a file under `<root>/<bucket>/`,
 * with its content type in a `.meta.json` beside it. A put writes both under names of its own
 * ending in `.part` and renames them once complete, so a read never sees a partial object and two
 * writes of one key (a retried upload part) never write into the same file. Every operation first proves its path stays
 * under the root, by its text and by its real path, so neither a crafted key nor a link inside the
 * share can lead to files outside it. Tests use it on a temporary folder.
 */
export function createNasDriver(root: string): StorageDriver {
  /** The file of an object, refused unless its text and its existing folders stay under the root. */
  const path = async (bucket: Bucket, key: string): Promise<string> => {
    assertKey(key);
    if (!BUCKETS.includes(bucket) || key.endsWith(META_SUFFIX) || key.endsWith(PART_SUFFIX))
      throw refused();
    const file = join(root, bucket, ...key.split('/'));
    if (!inside(root, file)) throw refused();
    const realRoot = await realpath(root);
    if (!inside(realRoot, await deepestReal(dirname(file)))) throw refused();
    return file;
  };

  /** Refuses an object that is itself a link; a missing one passes, for the caller to report. */
  const notLink = async (file: string): Promise<void> => {
    try {
      if ((await lstat(file)).isSymbolicLink()) throw refused();
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  };

  return {
    name: 'nas',

    async put(bucket, key, body, meta) {
      const file = await path(bucket, key);
      await notLink(file);
      const own = randomUUID();
      const part = `${file}.${own}${PART_SUFFIX}`;
      const metaPart = `${file}${META_SUFFIX}.${own}${PART_SUFFIX}`;
      await mkdir(dirname(file), { recursive: true });
      try {
        await pipeline(body, createWriteStream(part));
        await writeFile(metaPart, JSON.stringify({ contentType: meta.contentType }));
        await rename(part, file);
        await rename(metaPart, `${file}${META_SUFFIX}`);
      } catch (error) {
        await rm(part, { force: true });
        await rm(metaPart, { force: true });
        throw error;
      }
    },

    async get(bucket, key) {
      const file = await path(bucket, key);
      await notLink(file);
      try {
        await lstat(file);
      } catch (error) {
        if (isMissing(error)) throw new NotFoundError(bucket, key);
        throw error;
      }
      return createReadStream(file);
    },

    async stat(bucket, key) {
      const file = await path(bucket, key);
      await notLink(file);
      let size: number;
      try {
        size = (await lstat(file)).size;
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
      // a write or removal cut short can leave the object without its content type file
      try {
        const meta = Meta.parse(JSON.parse(await readFile(`${file}${META_SUFFIX}`, 'utf8')));
        return { size, contentType: meta.contentType };
      } catch (error) {
        if (isMissing(error)) return { size, contentType: undefined };
        throw error;
      }
    },

    async remove(bucket, key) {
      const file = await path(bucket, key);
      await notLink(file);
      await rm(file, { force: true });
      await rm(`${file}${META_SUFFIX}`, { force: true });
    },

    async ping() {
      try {
        await access(root, constants.R_OK | constants.W_OK);
        return true;
      } catch {
        return false;
      }
    },
  };
}
