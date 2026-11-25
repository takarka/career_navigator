/**
 * Реальное приложение NestJS для проверки порядка жизненного цикла запроса (оракул модели src/engine/nestlifecycle.ts).
 * Компоненты каждого уровня (global, controller, route) пишут своё имя в trace. Зависимости не внедряются
 * (esbuild не поддерживает emitDecoratorMetadata), поэтому компоненты без конструкторных зависимостей.
 */
import 'reflect-metadata';
import {
  ArgumentsHost, BadRequestException, CallHandler, CanActivate, Catch, Controller, ExceptionFilter, ExecutionContext, Get, Injectable, MiddlewareConsumer,
  Module, NestInterceptor, NestMiddleware, NestModule, PipeTransform, Query, Req, Type, UseFilters, UseGuards, UseInterceptors, UsePipes,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Observable, tap } from 'rxjs';

export const trace: string[] = [];
const t = (s: string) => trace.push(s);

export type Level = 'global' | 'controller' | 'route';
export interface Layout {
  middleware: boolean;
  guards: Level[];
  interceptors: Level[];
  /** param — pipe на самом параметре */
  pipes: (Level | 'param')[];
  filters: Level[];
}

function guard(level: string): Type<CanActivate> {
  @Injectable()
  class G implements CanActivate {
    canActivate(ctx: ExecutionContext) {
      t(`guard:${level}`);
      return ctx.switchToHttp().getRequest().query.deny !== level;
    }
  }
  return G;
}
function interceptor(level: string): Type<NestInterceptor> {
  @Injectable()
  class I implements NestInterceptor {
    intercept(_c: ExecutionContext, next: CallHandler): Observable<unknown> {
      t(`interceptor:${level}:before`);
      return next.handle().pipe(tap({ next: () => t(`interceptor:${level}:after`) }));
    }
  }
  return I;
}
function pipe(level: string): Type<PipeTransform> {
  @Injectable()
  class P implements PipeTransform {
    transform(value: string) {
      t(`pipe:${level}`);
      if (value === `bad-${level}`) throw new BadRequestException('bad value');
      return value;
    }
  }
  return P;
}
function filter(level: string): Type<ExceptionFilter> {
  @Catch()
  class F implements ExceptionFilter {
    catch(e: unknown, host: ArgumentsHost) {
      t(`filter:${level}`);
      const status = (e as { getStatus?: () => number }).getStatus?.() ?? 500;
      host.switchToHttp().getResponse().status(status).json({ error: String((e as Error).message) });
    }
  }
  return F;
}

@Injectable()
class Mw implements NestMiddleware {
  use(_req: unknown, _res: unknown, next: () => void) {
    t('middleware');
    next();
  }
}

export async function startApp(layout: Layout) {
  const has = <T extends string>(list: T[], l: T) => list.includes(l);
  const gR = has(layout.guards, 'route') ? [UseGuards(guard('route'))] : [];
  const iR = has(layout.interceptors, 'route') ? [UseInterceptors(interceptor('route'))] : [];
  const fR = has(layout.filters, 'route') ? [UseFilters(filter('route'))] : [];
  const pParam = has(layout.pipes, 'param') ? pipe('param') : undefined;

  class TestController {
    handle(v: string, req: { query: Record<string, string> }) {
      t('handler');
      if (req.query.fail === '1') throw new Error('handler failed');
      return { v };
    }
  }
  // применяем декораторы программно: так порядок и состав слоёв задаются данными
  Controller('t')(TestController);
  if (has(layout.guards, 'controller')) UseGuards(guard('controller'))(TestController);
  if (has(layout.interceptors, 'controller')) UseInterceptors(interceptor('controller'))(TestController);
  if (has(layout.filters, 'controller')) UseFilters(filter('controller'))(TestController);
  if (has(layout.pipes, 'controller')) UsePipes(pipe('controller'))(TestController);
  const desc = Object.getOwnPropertyDescriptor(TestController.prototype, 'handle')!;
  Get()(TestController.prototype, 'handle', desc);
  const pR = has(layout.pipes, 'route') ? [UsePipes(pipe('route'))] : [];
  for (const d of [...gR, ...iR, ...fR, ...pR]) d(TestController.prototype, 'handle', desc);
  Query('v', ...(pParam ? [pParam] : []))(TestController.prototype, 'handle', 0);
  Req()(TestController.prototype, 'handle', 1);

  class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
      if (layout.middleware) consumer.apply(Mw).forRoutes('*');
    }
  }
  Module({ controllers: [TestController] })(AppModule);

  const app = await NestFactory.create(AppModule, { logger: false });
  if (has(layout.guards, 'global')) app.useGlobalGuards(new (guard('global'))());
  if (has(layout.interceptors, 'global')) app.useGlobalInterceptors(new (interceptor('global'))());
  if (has(layout.pipes, 'global')) app.useGlobalPipes(new (pipe('global'))());
  if (has(layout.filters, 'global')) app.useGlobalFilters(new (filter('global'))());
  await app.listen(0, '127.0.0.1');
  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  return { app, url };
}
