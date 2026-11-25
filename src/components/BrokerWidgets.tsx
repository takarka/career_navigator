import { useMemo, useState } from 'preact/hooks';
import { route, type Binding, type ExchangeType } from '../engine/rabbit.ts';
import * as R from '../engine/rabbit.ts';
import * as K from '../engine/kafka.ts';
import { crashPoints, deliveryTimeline, describeCrash, runDelivery, type AckMode, type CrashPoint } from '../engine/delivery.ts';
import { outboxTimeline, runOutbox, type Crash, type Mode } from '../engine/outbox.ts';
import { orderSaga, runSaga, sagaTimeline, type Style } from '../engine/saga.ts';
import { applyStream, demoStream, expectedBalance, type Approach } from '../engine/idempotency.ts';
import { backoffSchedule, type Jitter } from '../engine/retry.ts';
import { Chart } from './Chart.tsx';
import { Timeline } from './Timeline.tsx';
import { DiagramCanvas } from './DiagramCanvas.tsx';
import type { DiagramSpec } from '../engine/diagram.ts';

const sel = (v: string, set: (x: string) => void, id: string, opts: [string, string][]) => (
  <select id={id} value={v} onChange={(e) => set((e.target as HTMLSelectElement).value)}>
    {opts.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
  </select>
);

/* ---------- l01: синхронная цепочка против очереди ---------- */
const syncSpec: DiagramSpec = {
  nodes: [
    { id: 'web', kind: 'client', label: 'Клиент', x: 10, y: 20 },
    { id: 'orders', kind: 'service', label: 'Заказы', x: 190, y: 20 },
    { id: 'pay', kind: 'service', label: 'Платежи', x: 370, y: 20 },
    { id: 'mail', kind: 'service', label: 'Почта', x: 550, y: 20 },
  ],
  edges: [{ from: 'web', to: 'orders', sync: true }, { from: 'orders', to: 'pay', sync: true }, { from: 'orders', to: 'mail', sync: true }],
};
const asyncSpec: DiagramSpec = {
  nodes: [
    { id: 'web', kind: 'client', label: 'Клиент', x: 10, y: 20 },
    { id: 'orders', kind: 'service', label: 'Заказы', x: 190, y: 20 },
    { id: 'pay', kind: 'service', label: 'Платежи', x: 370, y: 20 },
    { id: 'q', kind: 'queue', label: 'Очередь событий', x: 370, y: 110 },
    { id: 'mail', kind: 'service', label: 'Почта', x: 550, y: 110 },
  ],
  edges: [{ from: 'web', to: 'orders', sync: true }, { from: 'orders', to: 'pay', sync: true }, { from: 'orders', to: 'q', sync: false, label: 'событие' }, { from: 'mail', to: 'q', sync: true }],
};

export function SyncVsAsync() {
  const [asyncMode, setAsyncMode] = useState(false);
  return (
    <div class="syncasync">
      <div class="seg" role="group" aria-label="Способ связи">
        <button class={asyncMode ? '' : 'on'} aria-pressed={!asyncMode} onClick={() => setAsyncMode(false)}>Всё синхронно</button>
        <button class={asyncMode ? 'on' : ''} aria-pressed={asyncMode} onClick={() => setAsyncMode(true)}>Письма через очередь</button>
      </div>
      <DiagramCanvas key={asyncMode ? 'a' : 's'} spec={asyncMode ? asyncSpec : syncSpec} caption="Уронить «Почту»: при синхронной связи заказ перестаёт работать, через очередь заказы продолжаются, а письма ждут в очереди. Модель простого правила каскада." />
    </div>
  );
}

/* ---------- l02: маршрутизация RabbitMQ ---------- */
const bindingsFor: Record<ExchangeType, Binding[]> = {
  direct: [{ queue: 'errors', key: 'error' }, { queue: 'all-logs', key: 'info' }, { queue: 'all-logs', key: 'warning' }, { queue: 'all-logs', key: 'error' }],
  fanout: [{ queue: 'errors', key: '' }, { queue: 'all-logs', key: '' }, { queue: 'metrics', key: '' }],
  topic: [{ queue: 'orders', key: 'order.*' }, { queue: 'eu-orders', key: 'order.eu.#' }, { queue: 'audit', key: '#' }, { queue: 'payments', key: '*.payment.*' }],
};
const keysFor: Record<ExchangeType, string[]> = {
  direct: ['error', 'warning', 'info', 'debug'],
  fanout: ['любой ключ'],
  topic: ['order.created', 'order.eu.created', 'order.eu.refund.done', 'shop.payment.failed', 'user'],
};

export function RabbitRouting() {
  const [type, setType] = useState<ExchangeType>('direct');
  const [key, setKey] = useState('error');
  const bindings = bindingsFor[type];
  const hit = route(type, bindings, key);
  const queues = [...new Set(bindings.map((b) => b.queue))];
  return (
    <div class="rabbitroute">
      <div class="row wrap">
        <label>Тип exchange{' '}{sel(type, (v) => { setType(v as ExchangeType); setKey(keysFor[v as ExchangeType][0]); }, 'ex-type', [['direct', 'direct'], ['fanout', 'fanout'], ['topic', 'topic']])}</label>
        <label>Ключ маршрутизации{' '}{sel(key, setKey, 'ex-key', keysFor[type].map((k) => [k, k]))}</label>
      </div>
      <div class="grid2">
        <div>
          <div class="pane-title">Биндинги (очередь ← ключ или шаблон)</div>
          <ul>{bindings.map((b, i) => <li key={i}><code>{b.queue}</code> ← <code>{type === 'fanout' ? '(ключ не нужен)' : b.key}</code></li>)}</ul>
        </div>
        <div>
          <div class="pane-title">Куда попадёт сообщение с ключом «{key}»</div>
          <ul class="queues">
            {queues.map((q) => <li key={q} class={hit.includes(q) ? 'hit' : ''}><code>{q}</code> {hit.includes(q) ? '✓ получит копию' : '— не получит'}</li>)}
          </ul>
          {hit.length === 0 && <p class="callout warn">Ни одна очередь не подошла: сообщение будет отброшено (если не включён mandatory/alternate exchange).</p>}
        </div>
      </div>
    </div>
  );
}

/* ---------- l02/l06: симулятор RabbitMQ ---------- */
type Preset = 'basic' | 'retry';

function makeBroker(preset: Preset): R.Broker {
  if (preset === 'retry') {
    return R.addConsumer(
      R.createBroker([{ name: 'work', deadLetterTo: 'retry' }, { name: 'retry', ttl: 1000, deadLetterTo: 'work' }, { name: 'dlq' }], { type: 'direct', bindings: [{ queue: 'work', key: 'job' }] }),
      { id: 'c1', queue: 'work', prefetch: 1, processMs: 100, onFail: 'dead-letter', maxAttempts: 3, giveUpTo: 'dlq' },
    );
  }
  return R.addConsumer(R.createBroker([{ name: 'work' }], { type: 'direct', bindings: [{ queue: 'work', key: 'job' }] }), { id: 'c1', queue: 'work', prefetch: 1, processMs: 500, onFail: 'requeue' });
}

export function RabbitSim({ preset: initial = 'basic' }: { preset?: Preset }) {
  const [preset, setPreset] = useState<Preset>(initial);
  const [b, setB] = useState(() => makeBroker(initial));
  const c = R.census(b);
  const reset = (p: Preset) => { setPreset(p); setB(makeBroker(p)); };
  const alive = b.consumers.filter((x) => x.alive);
  return (
    <div class="rabbitsim">
      <div class="seg" role="group" aria-label="Топология">
        <button class={preset === 'basic' ? 'on' : ''} aria-pressed={preset === 'basic'} onClick={() => reset('basic')}>Очередь, ack и prefetch</button>
        <button class={preset === 'retry' ? 'on' : ''} aria-pressed={preset === 'retry'} onClick={() => reset('retry')}>Ретраи: TTL + DLX + DLQ</button>
      </div>
      <div class="row wrap">
        <button onClick={() => setB(R.publish(b, 'job'))}>Отправить сообщение</button>
        <button onClick={() => setB(R.publish(b, 'job', true))}>Отправить «ядовитое»</button>
        {preset === 'basic' && <button onClick={() => setB(R.addConsumer(b, { id: `c${b.consumers.length + 1}`, queue: 'work', prefetch: 1, processMs: 200, onFail: 'requeue' }))}>Добавить consumer</button>}
        {alive[0] && <button onClick={() => setB(R.killConsumer(b, alive[alive.length - 1].id))}>Убить consumer до ack</button>}
        <button onClick={() => setB(R.advance(b, 100))}>+100 мс</button>
        <button onClick={() => setB(R.advance(b, 1000))}>+1 с</button>
        <button onClick={() => reset(preset)}>Сброс</button>
      </div>
      <p aria-live="polite">Время: <b>{b.now} мс</b>. Готовы: <b>{c.ready}</b> · В обработке (unacked): <b>{c.unacked}</b> · Подтверждено: <b>{c.acked}</b> · Потеряно: <b>{c.dropped}</b></p>
      <div class="grid2">
        <div>
          <div class="pane-title">Очереди</div>
          <ul class="queues">
            {Object.entries(b.queues).map(([name, q]) => (
              <li key={name}><code>{name}</code>{q.def.ttl ? ` (TTL ${q.def.ttl} мс)` : ''}{q.def.deadLetterTo ? ` → DLX → ${q.def.deadLetterTo}` : ''}: {q.ready.length ? q.ready.map((m) => <span key={m.id} class="chip">#{m.id}{m.poison ? '☠' : ''}{m.redelivered ? '↺' : ''}</span>) : <span class="empty">пусто</span>}</li>
            ))}
          </ul>
          <div class="pane-title">Consumer</div>
          <ul>{b.consumers.map((x) => <li key={x.id}>{x.id} {x.alive ? '' : '(упал)'} prefetch {x.prefetch}: {x.inflight.length ? x.inflight.map((f) => <span key={f.msg.id} class="chip">#{f.msg.id}</span>) : <span class="empty">ждёт</span>}</li>)}</ul>
        </div>
        <div>
          <div class="pane-title">Журнал</div>
          <ol class="outlog">{b.log.slice(-14).map((l, i) => <li key={i}>{l}</li>)}</ol>
        </div>
      </div>
      <p class="model-note">Модель без оракула на реальном RabbitMQ (в среде разработки не было Docker); логика проверена инвариантами в автотестах. Проверь поведение лабораторией <code>labs/m08/rabbitmq</code>.</p>
    </div>
  );
}

/* ---------- l03: симулятор Kafka ---------- */
const KEYS = ['u1', 'u2', 'u3', 'u4'];

export function KafkaSim() {
  const [strategy, setStrategy] = useState<K.Strategy>('roundRobin');
  const [partitions, setPartitions] = useState(4);
  const [c, setC] = useState(() => K.addConsumer(K.createCluster(4)));
  const [key, setKey] = useState('u1');
  const reset = (p = partitions, s = strategy) => { setC(K.addConsumer(K.createCluster(p, s))); };
  const owner = (p: number) => c.consumers.find((x) => x.assigned.includes(p))?.id ?? '—';
  const lags = K.lag(c);
  return (
    <div class="kafkasim">
      <div class="row wrap">
        <label>Партиций: <b>{partitions}</b>
          <input type="range" min={1} max={6} value={partitions} onInput={(e) => { const v = Number((e.target as HTMLInputElement).value); setPartitions(v); reset(v); }} />
        </label>
        <label>Стратегия назначения{' '}{sel(strategy, (v) => { setStrategy(v as K.Strategy); reset(partitions, v as K.Strategy); }, 'k-strat', [['roundRobin', 'roundRobin'], ['range', 'range']])}</label>
      </div>
      <div class="row wrap">
        <label>Ключ{' '}{sel(key, setKey, 'k-key', KEYS.map((k) => [k, `${k} → партиция ${K.partitionForKey(k, partitions)}`]))}</label>
        <button onClick={() => setC(K.produce(c, key))}>Отправить сообщение</button>
        <button onClick={() => setC(K.addConsumer(c))}>Добавить consumer</button>
        {c.consumers.length > 0 && <button onClick={() => setC(K.removeConsumer(c, c.consumers[c.consumers.length - 1].id))}>Убрать consumer (упал)</button>}
        <button onClick={() => setC(K.poll(c))}>Обработать по сообщению</button>
        <button onClick={() => setC(K.commit(c))}>Коммит offset</button>
        <button onClick={() => reset()}>Сброс</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Партиция</th><th>Журнал (offset: ключ)</th><th>Закоммичено</th><th>Lag</th><th>Читает</th></tr></thead>
          <tbody>
            {c.log.map((l, p) => (
              <tr key={p}>
                <td>{p}</td>
                <td>{l.length ? l.map((m) => <span key={m.offset} class="chip">{m.offset}: {m.key}</span>) : <span class="empty">пусто</span>}</td>
                <td>{c.committed[p] ?? 0}</td>
                <td>{lags[p]}</td>
                <td>{owner(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>Consumer в группе: <b>{c.consumers.length}</b>, полезных (с партициями): <b>{K.usefulConsumers(c)}</b>. {c.consumers.length > partitions && 'Consumer больше, чем партиций: лишние простаивают.'}</p>
      <div class="grid2">
        <div>
          <div class="pane-title">Обработано каждым consumer</div>
          <ul>{c.consumers.map((x) => <li key={x.id}>{x.id} [{x.assigned.join(', ') || 'нет партиций'}]: {x.processed.join(' ') || '—'}</li>)}</ul>
        </div>
        <div>
          <div class="pane-title">Журнал событий</div>
          <ol class="outlog">{c.events.slice(-12).map((l, i) => <li key={i}>{l}</li>)}</ol>
        </div>
      </div>
      <p class="model-note">Партиция по ключу вычисляется настоящим murmur2 и совпадает с реализацией kafkajs (проверено автотестом), назначение roundRobin — тоже. Остальное — упрощённая модель без репликации и таймингов.</p>
    </div>
  );
}

/* ---------- l04: инжектор сбоев ---------- */
export function DeliveryInjector({ forceIdempotent }: { forceIdempotent?: boolean }) {
  const [ackMode, setAckMode] = useState<AckMode>('after');
  const [crash, setCrash] = useState<CrashPoint>('before-ack');
  const [idem, setIdem] = useState(!!forceIdempotent);
  const cfg = { ackMode, crash, idempotent: idem };
  const out = useMemo(() => runDelivery(cfg), [ackMode, crash, idem]);
  const spec = useMemo(() => deliveryTimeline(cfg), [ackMode, crash, idem]);
  return (
    <div class="delivery">
      <div class="row wrap">
        <label>Подтверждение{' '}{sel(ackMode, (v) => setAckMode(v as AckMode), 'd-ack', [['after', 'ack после обработки'], ['before', 'ack до обработки']])}</label>
        <label>Сбой{' '}{sel(crash, (v) => setCrash(v as CrashPoint), 'd-crash', crashPoints.map((p) => [p, describeCrash(ackMode, p)]))}</label>
        <label><input type="checkbox" checked={idem} onChange={() => setIdem(!idem)} /> Идемпотентный обработчик (таблица processed_messages)</label>
      </div>
      <Timeline key={`${ackMode}-${crash}-${idem}`} spec={spec} id="delivery-tl" />
      <p aria-live="polite">Итог: эффектов в БД — <b>{out.effects}</b>, доставок — <b>{out.deliveries}</b>. Вердикт: <b class={out.verdict === 'ok' ? 'ok-text' : 'bad-text'}>{out.verdict === 'ok' ? 'ровно один эффект' : out.verdict}</b>.</p>
    </div>
  );
}

/* ---------- l07: Outbox ---------- */
export function OutboxViz() {
  const [mode, setMode] = useState<Mode>('outbox');
  const [crash, setCrash] = useState<Crash>('between');
  const [inbox, setInbox] = useState(false);
  const cfg = { mode, crash, inbox };
  const out = useMemo(() => runOutbox(cfg), [mode, crash, inbox]);
  const spec = useMemo(() => outboxTimeline(cfg), [mode, crash, inbox]);
  return (
    <div class="outboxviz">
      <div class="row wrap">
        <label>Способ{' '}{sel(mode, (v) => setMode(v as Mode), 'o-mode', [['dual-db-first', 'Двойная запись: сначала БД, потом publish'], ['dual-publish-first', 'Двойная запись: сначала publish, потом БД'], ['outbox', 'Outbox + relay']])}</label>
        <label>Сбой{' '}{sel(crash, (v) => setCrash(v as Crash), 'o-crash', [['none', 'нет'], ['between', mode === 'outbox' ? 'relay упал после publish, до пометки' : 'падение между двумя записями']])}</label>
        <label><input type="checkbox" checked={inbox} onChange={() => setInbox(!inbox)} /> Inbox у получателя</label>
      </div>
      <Timeline key={`${mode}-${crash}-${inbox}`} spec={spec} id="outbox-tl" />
      <p aria-live="polite">БД изменена: <b>{out.dbChanged ? 'да' : 'нет'}</b> · опубликовано: <b>{out.published}</b> · эффектов у получателя: <b>{out.consumerEffects}</b> · Вердикт: <b class={out.verdict === 'ok' ? 'ok-text' : 'bad-text'}>{out.verdict}</b></p>
    </div>
  );
}

/* ---------- l08: Saga ---------- */
export function SagaViz() {
  const [style, setStyle] = useState<Style>('orchestration');
  const [fail, setFail] = useState('none');
  const failAt = fail === 'none' ? undefined : Number(fail);
  const run = useMemo(() => runSaga(orderSaga, failAt), [failAt]);
  const spec = useMemo(() => sagaTimeline(orderSaga, failAt, style), [failAt, style]);
  return (
    <div class="sagaviz">
      <div class="row wrap">
        <label>Стиль{' '}{sel(style, (v) => setStyle(v as Style), 's-style', [['orchestration', 'Оркестрация (команды)'], ['choreography', 'Хореография (события)']])}</label>
        <label>Отказ на шаге{' '}{sel(fail, setFail, 's-fail', [['none', 'нет отказов'], ...orderSaga.map((s, i) => [String(i), `${i + 1}. ${s.service}: ${s.action}`] as [string, string])])}</label>
      </div>
      <Timeline key={`${style}-${fail}`} spec={spec} id="saga-tl" />
      <div class="table-wrap">
        <table>
          <thead><tr><th>Шаг</th><th>Сервис</th><th>Состояние</th></tr></thead>
          <tbody>{orderSaga.map((s) => <tr key={s.id}><td>{s.action}</td><td>{s.service}</td><td>{run.states[s.id]}</td></tr>)}</tbody>
        </table>
      </div>
      <p aria-live="polite">Итог саги: <b>{run.final}</b>.</p>
    </div>
  );
}

/* ---------- l05: идемпотентность ---------- */

const approachLabel: Record<Approach, string> = {
  naive: 'Наивно: прибавлять при каждом сообщении',
  'set-value': 'Установить значение из сообщения',
  'dedup-table': 'Таблица processed_messages (UNIQUE) в одной транзакции с эффектом',
  'dedup-not-atomic': 'Таблица processed_messages и эффект в разных транзакциях',
};

export function IdempotencyCompare() {
  const [a, setA] = useState<Approach>('naive');
  const [crash, setCrash] = useState(false);
  const expected = expectedBalance(demoStream);
  const r = applyStream(a, demoStream, a === 'dedup-not-atomic' && crash ? 'm2' : undefined);
  return (
    <div class="idem">
      <p>Поток сообщений (с дублями и перестановкой): {demoStream.map((m, i) => <span key={i} class="chip">{m.id}: {m.delta > 0 ? '+' : ''}{m.delta}</span>)}</p>
      <div class="row wrap">
        <label>Подход{' '}{sel(a, (v) => setA(v as Approach), 'idem-approach', (Object.keys(approachLabel) as Approach[]).map((k) => [k, approachLabel[k]]))}</label>
        {a === 'dedup-not-atomic' && <label><input type="checkbox" checked={crash} onChange={() => setCrash(!crash)} /> Сбой процесса между записью в таблицу и эффектом (для m2)</label>}
      </div>
      <p aria-live="polite">Итоговый баланс: <b class={r.balance === expected ? 'ok-text' : 'bad-text'}>{r.balance}</b> (правильный: <b>{expected}</b>) — {r.balance === expected ? 'верно' : 'неверно'}.</p>
      <ul class="muted small">
        {r.applied.length > 0 && <li>Применено: {r.applied.join(', ')}</li>}
        {r.skipped.length > 0 && <li>Отсечено: {r.skipped.join('; ')}</li>}
      </ul>
    </div>
  );
}

/* ---------- l06: расписание повторов ---------- */
export function RetryPlanner() {
  const [base, setBase] = useState(1000);
  const [factor, setFactor] = useState(2);
  const [max, setMax] = useState(30000);
  const [attempts, setAttempts] = useState(6);
  const [jitter, setJitter] = useState<Jitter>('full');
  const sched = backoffSchedule({ base, factor, max, attempts, jitter, seed: 3 });
  const total = sched.reduce((s, x) => s + x, 0);
  return (
    <div class="retryplan">
      <div class="row wrap">
        <label>Базовая задержка: <b>{base} мс</b><input type="range" min={100} max={5000} step={100} value={base} onInput={(e) => setBase(Number((e.target as HTMLInputElement).value))} /></label>
        <label>Множитель: <b>{factor}</b><input type="range" min={1} max={4} step={0.5} value={factor} onInput={(e) => setFactor(Number((e.target as HTMLInputElement).value))} /></label>
        <label>Потолок: <b>{max / 1000} с</b><input type="range" min={5000} max={120000} step={5000} value={max} onInput={(e) => setMax(Number((e.target as HTMLInputElement).value))} /></label>
        <label>Попыток: <b>{attempts}</b><input type="range" min={1} max={10} value={attempts} onInput={(e) => setAttempts(Number((e.target as HTMLInputElement).value))} /></label>
        <label>Jitter{' '}{sel(jitter, (v) => setJitter(v as Jitter), 'rp-jitter', [['none', 'нет'], ['full', 'full: случайно в [0, задержка]'], ['equal', 'equal: половина + случайная половина']])}</label>
      </div>
      <Chart title="Задержки перед повторами" xLabel="номер повтора" yLabel="задержка, мс" kind="bar" categories={sched.map((_, i) => String(i + 1))} series={[{ name: 'задержка', points: sched.map((v, i) => [i, v] as [number, number]) }]} height={200} />
      <p>Общее время ожидания до отправки в DLQ: <b>{(total / 1000).toFixed(1)} с</b>. Jitter разводит повторы разных сообщений во времени и не даёт им бить в зависимость одновременной волной.</p>
    </div>
  );
}
