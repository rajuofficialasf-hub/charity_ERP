import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/env';
import { createStorage } from './index';

/** Injection token of the configured driver for Nest; removed with Nest in docs/plans/2026-10-11-1742-chore-stack-adoption-admin-minimal-plan.md (U6). */
export const STORAGE = Symbol('STORAGE');

@Global()
@Module({
  providers: [{ provide: STORAGE, inject: [ENV], useFactory: createStorage }],
  exports: [STORAGE],
})
export class StorageModule {}
