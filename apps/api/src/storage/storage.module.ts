import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { FilesystemStorage } from './filesystem-storage';
import { MinioStorage } from './minio-storage';
import { STORAGE, type StorageAdapter } from './storage';

/** Builds the configured adapter: MinIO, or the filesystem in tests (production refuses it). */
export function createStorage(env: Env): StorageAdapter {
  if (env.STORAGE_DRIVER === 'filesystem')
    return new FilesystemStorage(env.STORAGE_FS_ROOT!, env.CURSOR_SECRET);
  return new MinioStorage({
    endPoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    useSSL: env.MINIO_USE_SSL,
    accessKey: env.MINIO_ACCESS_KEY!,
    secretKey: env.MINIO_SECRET_KEY!,
  });
}

@Global()
@Module({
  providers: [{ provide: STORAGE, inject: [ENV], useFactory: createStorage }],
  exports: [STORAGE],
})
export class StorageModule {}
