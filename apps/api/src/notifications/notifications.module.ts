import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { createLogger } from '../container';
import {
  EMAIL_ADAPTER,
  InAppAdapter,
  SMS_ADAPTER,
  SmtpEmailAdapter,
  StubSmsAdapter,
} from './adapters';

/** Delivery adapters chosen by configuration (ADR-007); templates and the outbox come in T1.14. */
@Global()
@Module({
  providers: [
    {
      provide: EMAIL_ADAPTER,
      inject: [ENV],
      useFactory: (env: Env) =>
        new SmtpEmailAdapter({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          user: env.SMTP_USER,
          password: env.SMTP_PASSWORD,
          from: env.SMTP_FROM,
        }),
    },
    {
      provide: SMS_ADAPTER,
      inject: [ENV],
      useFactory: (env: Env) => new StubSmsAdapter(env.SMS_MODE, createLogger(env)),
    },
    InAppAdapter,
  ],
  exports: [EMAIL_ADAPTER, SMS_ADAPTER, InAppAdapter],
})
export class NotificationsModule {}
