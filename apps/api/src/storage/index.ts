// The storage entry point: the only place that knows which drivers exist. Everything
// outside storage/ imports from here only and never checks which driver is active; the
// container builds the one storage of the process with createStorage(env).
import type { Env } from '../config/env';
import { createFilesystemDriver } from './drivers/filesystem';
import { createS3Driver } from './drivers/s3'; // TEMP: remove when the NAS driver replaces it
import type { StorageDriver } from './types';

export {
  assertKey,
  type Bucket,
  BUCKETS,
  knownBucket,
  NotFoundError,
  type ObjectInfo,
  type StorageDriver,
} from './types';

// Adding or removing a driver is one file in drivers/ and one line here.
const drivers = {
  // TEMP: MinIO through the S3 driver until the NAS driver exists.
  s3: (env: Env) =>
    createS3Driver({
      endPoint: env.MINIO_ENDPOINT,
      port: env.MINIO_PORT,
      useSSL: env.MINIO_USE_SSL,
      accessKey: env.MINIO_ACCESS_KEY!,
      secretKey: env.MINIO_SECRET_KEY!,
    }),
  filesystem: (env: Env) => createFilesystemDriver(env.STORAGE_FS_ROOT!),
} satisfies Record<StorageDriver['name'], (env: Env) => StorageDriver>;

export function createStorage(env: Env): StorageDriver {
  return drivers[env.STORAGE_DRIVER](env);
}
