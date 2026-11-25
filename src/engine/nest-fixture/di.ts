import 'reflect-metadata';
import { Global, Module, Provider } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Graph, ModuleDef } from '../nestdi.ts';

/** Строит настоящие модули NestJS из описания графа и пытается запустить приложение. Возвращает сообщение ошибки или null. */
export async function bootstrapGraph(g: Graph): Promise<string | null> {
  const classes = new Map<string, new () => object>();
  for (const m of g.modules) classes.set(m.name, class {} as new () => object);
  const providerOf = (p: NonNullable<ModuleDef['providers']>[number]): Provider => ({
    provide: p.name,
    useFactory: (...deps: unknown[]) => ({ name: p.name, deps: deps.length }),
    inject: p.deps ?? [],
  });
  for (const m of g.modules) {
    const cls = classes.get(m.name)!;
    if (m.global) Global()(cls);
    Module({
      imports: (m.imports ?? []).map((i) => classes.get(i)!),
      providers: (m.providers ?? []).map(providerOf),
      exports: (m.exports ?? []).map((e) => (classes.has(e) && !(m.providers ?? []).some((p) => p.name === e) ? classes.get(e)! : e)),
    })(cls);
  }
  try {
    const app = await NestFactory.createApplicationContext(classes.get('AppModule')!, { logger: false, abortOnError: false });
    await app.close();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
