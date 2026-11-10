// The storage entry point: the only place that knows which drivers exist. Everything
// outside storage/ imports from here only and never checks which driver is active; the
// container builds the one storage of the process with createStorage(env).
import type { Env } from '../config/env';
import { createNasDriver } from './drivers/nas';
import { createS3Driver } from './drivers/s3'; // TEMP: remove when the app is on the NAS only
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
  nas: (env: Env) => createNasDriver(env.STORAGE_ROOT!),
  // TEMP: MinIO through the S3 driver until the NAS is mounted for the app.
  s3: (env: Env) =>
    createS3Driver({
      endPoint: env.MINIO_ENDPOINT,
      port: env.MINIO_PORT,
      useSSL: env.MINIO_USE_SSL,
      accessKey: env.MINIO_ACCESS_KEY!,
      secretKey: env.MINIO_SECRET_KEY!,
    }),
} satisfies Record<StorageDriver['name'], (env: Env) => StorageDriver>;

export function createStorage(env: Env): StorageDriver {
  return createDriver(env.STORAGE_DRIVER, env);
}

/** One driver by name, for the copy between drivers (scripts/storage-copy.ts). */
export function createDriver(name: StorageDriver['name'], env: Env): StorageDriver {
  return drivers[name](env);
}
