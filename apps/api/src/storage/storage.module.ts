import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/env';
import { createStorage } from './index';

/** Injection token of the configured driver (Nest, until U6 of the stack-adoption plan). */
export const STORAGE = Symbol('STORAGE');

@Global()
@Module({
  providers: [{ provide: STORAGE, inject: [ENV], useFactory: createStorage }],
  exports: [STORAGE],
})
export class StorageModule {}
