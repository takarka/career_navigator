/**
 * Упрощённая модель ValidationPipe: правила полей DTO + параметры whitelist, forbidNonWhitelisted, transform.
 * Показывает, что именно делает каждый параметр. Не заменяет class-validator.
 */
export interface FieldRule {
  name: string;
  type: 'int' | 'string' | 'string[]';
  required: boolean;
  min?: number;
  maxLength?: number;
  oneOf?: string[];
}

export const orderDtoRules: FieldRule[] = [
  { name: 'customerId', type: 'int', required: true, min: 1 },
  { name: 'comment', type: 'string', required: false, maxLength: 20 },
  { name: 'role', type: 'string', required: false, oneOf: ['user', 'admin'] },
];

export interface PipeOptions {
  whitelist: boolean;
  forbidNonWhitelisted: boolean;
  transform: boolean;
}

export interface PipeResult {
  status: 200 | 400;
  errors: string[];
  value?: Record<string, unknown>;
  stripped: string[];
}

export function validateDto(body: Record<string, unknown>, rules: FieldRule[], opts: PipeOptions): PipeResult {
  const errors: string[] = [];
  const out: Record<string, unknown> = {};
  const known = new Set(rules.map((r) => r.name));
  const extra = Object.keys(body).filter((k) => !known.has(k));
  if (opts.forbidNonWhitelisted && opts.whitelist) for (const k of extra) errors.push(`property ${k} should not exist`);

  for (const r of rules) {
    let v = body[r.name];
    if (v === undefined || v === null) {
      if (r.required) errors.push(`${r.name} should not be empty`);
      continue;
    }
    if (r.type === 'int') {
      if (typeof v === 'string' && opts.transform && /^-?\d+$/.test(v)) v = Number(v);
      if (typeof v !== 'number' || !Number.isInteger(v)) {
        errors.push(`${r.name} must be an integer number`);
        continue;
      }
      if (r.min !== undefined && v < r.min) errors.push(`${r.name} must not be less than ${r.min}`);
    } else if (r.type === 'string') {
      if (typeof v !== 'string') {
        errors.push(`${r.name} must be a string`);
        continue;
      }
      if (r.maxLength !== undefined && v.length > r.maxLength) errors.push(`${r.name} must be shorter than or equal to ${r.maxLength} characters`);
      if (r.oneOf && !r.oneOf.includes(v)) errors.push(`${r.name} must be one of the following values: ${r.oneOf.join(', ')}`);
    }
    out[r.name] = v;
  }
  if (errors.length) return { status: 400, errors, stripped: [] };
  const value = opts.whitelist ? out : { ...Object.fromEntries(extra.map((k) => [k, body[k]])), ...out };
  return { status: 200, errors: [], value, stripped: opts.whitelist ? extra : [] };
}

export interface EnvRule {
  name: string;
  required: boolean;
  kind: 'string' | 'port' | 'url' | 'enum';
  enum?: string[];
  secret?: boolean;
}

export const envRules: EnvRule[] = [
  { name: 'NODE_ENV', required: true, kind: 'enum', enum: ['development', 'test', 'production'] },
  { name: 'PORT', required: false, kind: 'port' },
  { name: 'DATABASE_URL', required: true, kind: 'url', secret: true },
  { name: 'JWT_SECRET', required: true, kind: 'string', secret: true },
];

export function validateEnv(env: Record<string, string>, rules: EnvRule[]): string[] {
  const errs: string[] = [];
  for (const r of rules) {
    const v = env[r.name];
    if (v === undefined || v === '') {
      if (r.required) errs.push(`${r.name}: обязательная переменная не задана`);
      continue;
    }
    if (r.kind === 'port' && !(/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 65535)) errs.push(`${r.name}: ожидался порт 1–65535`);
    if (r.kind === 'url') {
      try {
        new URL(v);
      } catch {
        errs.push(`${r.name}: ожидался корректный URL`);
      }
    }
    if (r.kind === 'enum' && !r.enum!.includes(v)) errs.push(`${r.name}: допустимо ${r.enum!.join(' | ')}`);
    if (r.kind === 'string' && r.secret && v.length < 16) errs.push(`${r.name}: секрет слишком короткий (нужно не менее 16 символов)`);
  }
  return errs;
}
