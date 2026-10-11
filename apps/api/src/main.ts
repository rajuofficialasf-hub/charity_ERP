import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv(process.env);
  const app = configureApp(await NestFactory.create(AppModule));
  await app.listen(env.PORT);
}

void bootstrap();
