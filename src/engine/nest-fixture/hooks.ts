import 'reflect-metadata';
import { Injectable, Module, OnApplicationBootstrap, OnApplicationShutdown, OnModuleDestroy, OnModuleInit, BeforeApplicationShutdown } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

export const hooksTrace: string[] = [];

@Injectable()
class A implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy, BeforeApplicationShutdown, OnApplicationShutdown {
  onModuleInit() { hooksTrace.push('A.onModuleInit'); }
  onApplicationBootstrap() { hooksTrace.push('A.onApplicationBootstrap'); }
  onModuleDestroy() { hooksTrace.push('A.onModuleDestroy'); }
  beforeApplicationShutdown(signal?: string) { hooksTrace.push(`A.beforeApplicationShutdown${signal ? `(${signal})` : ''}`); }
  onApplicationShutdown(signal?: string) { hooksTrace.push(`A.onApplicationShutdown${signal ? `(${signal})` : ''}`); }
}

@Module({ providers: [A] })
class AppModule {}

export async function runHooks(): Promise<string[]> {
  hooksTrace.length = 0;
  const app = await NestFactory.create(AppModule, { logger: false });
  hooksTrace.push('— listen —');
  await app.listen(0, '127.0.0.1');
  hooksTrace.push('— close —');
  await app.close();
  return [...hooksTrace];
}
