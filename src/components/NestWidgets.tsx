import { useMemo, useState } from 'preact/hooks';
import { lifecycle, stepLabel, type Layout, type Level, type Outcome } from '../engine/nestlifecycle.ts';
import { diScenarios, unresolved } from '../engine/nestdi.ts';

const LEVELS: Level[] = ['global', 'controller', 'route'];
const levelRu: Record<string, string> = { global: 'глобальный', controller: 'на контроллере', route: 'на методе', param: 'на параметре' };

function Toggle({ label, items, value, onChange }: { label: string; items: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset class="nest-toggle">
      <legend>{label}</legend>
      {items.map((it) => (
        <label key={it}><input type="checkbox" checked={value.includes(it)} onChange={() => onChange(value.includes(it) ? value.filter((x) => x !== it) : [...value, it])} /> {levelRu[it]}</label>
      ))}
    </fieldset>
  );
}

/** Жизненный цикл запроса NestJS: собери набор компонентов и исход, получи порядок вызовов. Модель сверена с настоящим NestJS. */
export function NestLifecycleSim() {
  const [mw, setMw] = useState(true);
  const [guards, setGuards] = useState<string[]>(['global', 'route']);
  const [ints, setInts] = useState<string[]>(['global', 'controller']);
  const [pipes, setPipes] = useState<string[]>(['global', 'param']);
  const [filters, setFilters] = useState<string[]>(['global']);
  const [outcome, setOutcome] = useState('ok');
  const layout = { middleware: mw, guards, interceptors: ints, pipes, filters } as Layout;
  const out: Outcome = outcome === 'ok' ? { kind: 'ok' } : outcome === 'throw' ? { kind: 'handler-throw' } : outcome.startsWith('deny:') ? { kind: 'guard-deny', level: outcome.slice(5) as Level } : { kind: 'pipe-fail', at: outcome.slice(5) as Level | 'param' };
  const order = useMemo(() => lifecycle(layout, out), [mw, guards, ints, pipes, filters, outcome]);
  return (
    <div class="nestlife">
      <div class="row wrap">
        <label><input type="checkbox" checked={mw} onChange={() => setMw(!mw)} /> Middleware</label>
        <Toggle label="Guards" items={LEVELS} value={guards} onChange={setGuards} />
        <Toggle label="Interceptors" items={LEVELS} value={ints} onChange={setInts} />
        <Toggle label="Pipes" items={[...LEVELS, 'param']} value={pipes} onChange={setPipes} />
        <Toggle label="Exception filters" items={LEVELS} value={filters} onChange={setFilters} />
      </div>
      <label>Исход запроса{' '}
        <select value={outcome} onChange={(e) => setOutcome((e.target as HTMLSelectElement).value)}>
          <option value="ok">успех (200)</option>
          <option value="throw">исключение в обработчике</option>
          {guards.map((g) => <option key={`d${g}`} value={`deny:${g}`}>guard ({levelRu[g]}) запрещает (403)</option>)}
          {pipes.map((p) => <option key={`p${p}`} value={`pipe:${p}`}>pipe ({levelRu[p]}) отклоняет значение (400)</option>)}
        </select>
      </label>
      <ol class="nest-order" aria-label="Порядок вызова компонентов">
        {order.map((s, i) => {
          const kind = s.split(':')[0];
          const lv = s.split(':')[1];
          const err = s.startsWith('filter');
          return (
            <li key={i} class={err ? 'bad' : s === 'handler' ? 'hand' : ''}>
              <b>{stepLabel[kind] ?? s}</b>{lv && lv !== 'default' ? ` — ${levelRu[lv] ?? lv}` : ''}{s.endsWith(':before') ? ' (до)' : s.endsWith(':after') ? ' (после)' : ''}{s === 'filter:default' ? ' — встроенный' : ''}
            </li>
          );
        })}
      </ol>
      <p class="model-note">Порядок проверен автотестом на настоящем NestJS (4 раскладки × все исходы): <code>src/engine/nestlifecycle.test.ts</code>. Если пользовательского фильтра нет, ответ формирует встроенный фильтр.</p>
    </div>
  );
}

/** Видимость провайдеров между модулями NestJS: сценарии «видит или нет». */
export function NestDiViz() {
  const [i, setI] = useState(0);
  const sc = diScenarios[i];
  const problems = unresolved(sc.graph);
  return (
    <div class="nestdi">
      <label>Сценарий{' '}
        <select value={String(i)} onChange={(e) => setI(Number((e.target as HTMLSelectElement).value))}>
          {diScenarios.map((s, k) => <option key={s.id} value={String(k)}>{s.title}</option>)}
        </select>
      </label>
      <div class="grid2">
        {sc.graph.modules.map((m) => (
          <div key={m.name} class="nestmod">
            <b>{m.name}{m.global ? ' (@Global)' : ''}</b>
            <ul class="small">
              {m.imports?.length ? <li>imports: {m.imports.join(', ')}</li> : null}
              {m.providers?.length ? <li>providers: {m.providers.map((p) => (p.deps?.length ? `${p.name} ← ${p.deps.join(', ')}` : p.name)).join('; ')}</li> : null}
              {m.exports?.length ? <li>exports: {m.exports.join(', ')}</li> : null}
            </ul>
          </div>
        ))}
      </div>
      <p aria-live="polite" class={problems.length ? 'bad-text' : 'ok-text'}>
        {problems.length ? <>✗ Приложение не запустится: Nest can't resolve dependencies of the <b>{problems[0].provider}</b> (?). Argument «{problems[0].dep}» is not available in <b>{problems[0].module}</b>.</> : '✓ Все зависимости разрешены, приложение запустится.'}
      </p>
      <p class="muted">{sc.why}</p>
    </div>
  );
}

/* ---------- Pipe и окружение ---------- */
import { envRules, orderDtoRules, validateDto, validateEnv } from '../engine/dtopipe.ts';

export function DtoPipeDemo() {
  const [body, setBody] = useState('{\n  "customerId": "5",\n  "comment": "срочно",\n  "isAdmin": true\n}');
  const [wl, setWl] = useState(true);
  const [forbid, setForbid] = useState(false);
  const [tr, setTr] = useState(true);
  let parsed: Record<string, unknown> | null = null;
  try {
    const p = JSON.parse(body);
    parsed = p && typeof p === 'object' && !Array.isArray(p) ? p : null;
  } catch {
    parsed = null;
  }
  const res = parsed ? validateDto(parsed, orderDtoRules, { whitelist: wl, forbidNonWhitelisted: forbid, transform: tr }) : null;
  return (
    <div class="dtopipe">
      <p class="muted small">DTO: <code>customerId</code> (целое, ≥ 1, обязательно), <code>comment</code> (строка до 20 символов), <code>role</code> (user | admin).</p>
      <label for="dto-body">Тело запроса (JSON)</label>
      <textarea id="dto-body" rows={6} style={{ width: '100%', fontFamily: 'ui-monospace, monospace' }} value={body} onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)} />
      <div class="row wrap">
        <label><input type="checkbox" checked={wl} onChange={() => setWl(!wl)} /> whitelist</label>
        <label><input type="checkbox" checked={forbid} onChange={() => setForbid(!forbid)} /> forbidNonWhitelisted</label>
        <label><input type="checkbox" checked={tr} onChange={() => setTr(!tr)} /> transform</label>
      </div>
      <div aria-live="polite">
        {!res && <p class="callout warn">Некорректный JSON.</p>}
        {res && res.status === 400 && <><p class="bad-text"><b>400 Bad Request</b></p><ul>{res.errors.map((e) => <li key={e}>{e}</li>)}</ul></>}
        {res && res.status === 200 && <><p class="ok-text"><b>Обработчик получит:</b></p><pre>{JSON.stringify(res.value, null, 2)}</pre>{res.stripped.length > 0 && <p class="muted">Молча удалены поля: {res.stripped.join(', ')}.</p>}</>}
      </div>
      <p class="model-note">Упрощённая модель параметров ValidationPipe, а не class-validator.</p>
    </div>
  );
}

export function EnvCheck() {
  const [text, setText] = useState('NODE_ENV=production\nPORT=3000\nDATABASE_URL=postgres://app:secret@db:5432/app\nJWT_SECRET=short');
  const env = Object.fromEntries(text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
  const errs = validateEnv(env, envRules);
  return (
    <div class="envcheck">
      <p class="muted small">Схема: NODE_ENV (development | test | production), PORT (необязательно), DATABASE_URL (URL), JWT_SECRET (не короче 16 символов). Не вводи настоящие секреты: страница работает локально, но это учебный пример.</p>
      <label for="env-text">Переменные окружения</label>
      <textarea id="env-text" rows={6} style={{ width: '100%', fontFamily: 'ui-monospace, monospace' }} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      <p aria-live="polite" class={errs.length ? 'bad-text' : 'ok-text'}>{errs.length ? `✗ Приложение не запустится (${errs.length}):` : '✓ Окружение корректно: приложение стартует.'}</p>
      {errs.length > 0 && <ul>{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
    </div>
  );
}
