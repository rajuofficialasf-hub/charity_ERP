import type { Readable } from 'node:stream';
import { Client } from 'minio';
import {
  assertKey,
  type Bucket,
  BUCKETS,
  type ObjectInfo,
  type SignedUrl,
  type StorageAdapter,
  urlTtl,
} from './storage';

export interface MinioOptions {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  /** Buckets the readiness check expects (default: all of FILES_AND_DOCUMENTS 8). */
  buckets?: readonly string[];
}

/** MinIO through its S3-compatible API (ADR-005); presigned URLs expire within 15 minutes. */
export class MinioStorage implements StorageAdapter {
  private readonly client: Client;
  private readonly buckets: readonly string[];

  constructor(options: MinioOptions) {
    this.client = new Client({
      endPoint: options.endPoint,
      port: options.port,
      useSSL: options.useSSL,
      accessKey: options.accessKey,
      secretKey: options.secretKey,
    });
    this.buckets = options.buckets ?? BUCKETS;
  }

  async put(
    bucket: Bucket,
    key: string,
    body: Buffer | Readable,
    options: { contentType: string; size?: number },
  ): Promise<void> {
    assertKey(key);
    await this.client.putObject(bucket, key, body, options.size, {
      'Content-Type': options.contentType,
    });
  }

  async get(bucket: Bucket, key: string): Promise<Readable> {
    assertKey(key);
    return this.client.getObject(bucket, key);
  }

  async stat(bucket: Bucket, key: string): Promise<ObjectInfo | null> {
    assertKey(key);
    try {
      const info = await this.client.statObject(bucket, key);
      const meta = info.metaData as Record<string, string> | undefined;
      return { size: info.size, contentType: meta?.['content-type'] };
    } catch (error) {
      if ((error as { code?: string }).code === 'NotFound') return null;
      throw error;
    }
  }

  async presignGet(bucket: Bucket, key: string, ttlSeconds?: number): Promise<SignedUrl> {
    assertKey(key);
    const ttl = urlTtl(ttlSeconds);
    const url = await this.client.presignedGetObject(bucket, key, ttl);
    return { url, expiresAt: new Date(Date.now() + ttl * 1000) };
  }

  async presignPut(bucket: Bucket, key: string, ttlSeconds?: number): Promise<SignedUrl> {
    assertKey(key);
    const ttl = urlTtl(ttlSeconds);
    const url = await this.client.presignedPutObject(bucket, key, ttl);
    return { url, expiresAt: new Date(Date.now() + ttl * 1000) };
  }

  async ping(): Promise<boolean> {
    try {
      const present = await Promise.all(this.buckets.map((b) => this.client.bucketExists(b)));
      return present.every(Boolean);
    } catch {
      return false;
    }
  }
}
