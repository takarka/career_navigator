// Проверка Zod-pipe и OpenAPI (@nestjs/swagger) из m06-l03 на настоящих пакетах; PostgreSQL не нужен.
import 'reflect-metadata';
import { Body, Controller, Module, PipeTransform, BadRequestException, Post, UsePipes } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiProperty, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { z } from 'zod';

const CreateUser = z.object({ email: z.string().email(), age: z.number().int().min(18) });

class ZodPipe implements PipeTransform {
  constructor(private schema: z.ZodTypeAny) {}
  transform(value: unknown) {
    const r = this.schema.safeParse(value);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    return r.data;
  }
}

class ItemDto {
  @ApiProperty({ example: 'a-1' }) sku: string;
  @ApiProperty({ minimum: 1 }) qty: number;
}

@Controller('users')
class UsersController {
  @Post() @UsePipes(new ZodPipe(CreateUser)) create(@Body() body: z.infer<typeof CreateUser>) { return { ok: true, email: body.email }; }
}
@Controller('items')
class ItemsController {
  @Post() add(@Body() dto: ItemDto) { return dto; }
}
@Module({ controllers: [UsersController, ItemsController] }) class M {}

(async () => {
  const app = await NestFactory.create(M, { logger: false });
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('t').setVersion('1').build());
  SwaggerModule.setup('docs', app, doc);
  await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${new URL(await app.getUrl()).port}`;
  const post = async (u: string, b: unknown) => { const r = await fetch(base + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json().catch(() => null) }; };
  const res: [boolean, string][] = [];
  const ok = await post('/users', { email: 'a@b.co', age: 20 });
  res.push([ok.s === 201 && ok.j.ok, `Zod pipe: верные данные 201 (${ok.s})`]);
  const bad = await post('/users', { email: 'x', age: 5 });
  res.push([bad.s === 400 && Array.isArray(bad.j.message) && bad.j.message.length === 2, `Zod pipe: невалидные 400 с двумя нарушениями (${bad.s} ${JSON.stringify(bad.j?.message)})`]);
  const schema = (doc.components as any).schemas.ItemDto;
  res.push([!!schema && schema.properties.sku.example === 'a-1' && schema.properties.qty.minimum === 1, `OpenAPI: схема ItemDto собрана из @ApiProperty (${JSON.stringify(schema)})`]);
  res.push([!!doc.paths['/users'].post && !!doc.paths['/items'].post, 'OpenAPI: маршруты POST /users и POST /items в документе']);
  const ui = await fetch(base + '/docs-json');
  const j: any = await ui.json();
  res.push([ui.status === 200 && j.openapi?.startsWith('3.'), `SwaggerModule.setup отдаёт /docs-json (${ui.status}, openapi ${j.openapi})`]);
  await app.close();
  let bad2 = 0;
  for (const [o, n] of res) { console.log(`${o ? 'OK    ' : 'ПРОВАЛ'} ${n}`); if (!o) bad2++; }
  console.log(bad2 ? `ПРОВАЛ: ${bad2}` : 'OK');
  process.exit(bad2 ? 1 : 0);
})();
