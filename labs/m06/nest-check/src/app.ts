// Код из уроков m06-l03 (DTO и ValidationPipe) и m06-l04 (ConfigModule, TypeOrmModule.forRootAsync), собранный tsc с emitDecoratorMetadata.
import 'reflect-metadata';
import { Body, Controller, Module, Post, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArrayNotEmpty, IsArray, IsInt, IsOptional, IsString, Min, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
  @IsString() sku: string;
  @IsInt() @Min(1) qty: number;
}

export class CreateOrderDto {
  @IsInt() @Min(1)
  customerId: number;

  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsOptional() @IsString() @MaxLength(200)
  comment?: string;
}

@Controller('orders')
export class OrdersController {
  @Post()
  create(@Body() dto: CreateOrderDto) {
    return { isInstance: dto instanceof CreateOrderDto, itemIsInstance: dto.items[0] instanceof OrderItemDto, customerIdType: typeof dto.customerId };
  }
}

export function validateEnv(env: Record<string, unknown>) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL обязательна');
  return env;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({ type: 'postgres', url: cfg.getOrThrow('DATABASE_URL'), autoLoadEntities: true }),
    }),
  ],
  controllers: [OrdersController],
})
export class AppModule {}

export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}
