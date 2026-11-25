import { useState } from 'preact/hooks';
import { Breaker } from '../engine/breaker.ts';

/** Circuit breaker: зависимость то работает, то падает; видно, как автомат защищает от долгих ожиданий. */
export function BreakerDemo() {
  const [healthy, setHealthy] = useState(true);
  const [br, setBr] = useState(() => new Breaker({ failureThreshold: 3, openMs: 5000 }));
  const [now, setNow] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [depCalls, setDepCalls] = useState(0);
  const call = () => {
    let called = false;
    const r = br.call(now, () => { called = true; return healthy; });
    if (called) setDepCalls((n) => n + 1);
    setLog((l) => [...l.slice(-9), `t=${now / 1000} с: ${r === 'ok' ? 'успех' : r === 'fail' ? 'ошибка зависимости' : 'быстрый отказ, зависимость не вызывалась'} (состояние: ${br.state})`]);
    setBr(Object.assign(Object.create(Object.getPrototypeOf(br)), br));
  };
  const reset = () => { setBr(new Breaker({ failureThreshold: 3, openMs: 5000 })); setNow(0); setLog([]); setDepCalls(0); };
  return (
    <div class="breaker">
      <div class="row wrap">
        <label><input type="checkbox" checked={healthy} onChange={() => setHealthy(!healthy)} /> Зависимость работает</label>
        <button class="primary" onClick={call}>Вызвать зависимость</button>
        <button onClick={() => setNow(now + 1000)}>+1 с</button>
        <button onClick={() => setNow(now + 5000)}>+5 с</button>
        <button onClick={reset}>Сброс</button>
      </div>
      <p aria-live="polite">Состояние: <b>{br.state === 'closed' ? 'закрыт (вызовы идут)' : br.state === 'open' ? 'открыт (быстрый отказ)' : 'полуоткрыт (пробный вызов)'}</b> · время {now / 1000} с · реальных обращений к зависимости: {depCalls}</p>
      <ol class="outlog">{log.map((l, i) => <li key={i}>{l}</li>)}</ol>
      <p class="model-note">Порог: 3 ошибки подряд, пауза 5 с. Поведение автомата проверено автотестами.</p>
    </div>
  );
}

import { badOrder, goodOrder, rebuilt } from '../engine/dockercache.ts';

export function DockerCacheDemo() {
  const [good, setGood] = useState(false);
  const [changed, setChanged] = useState('src/app.ts');
  const steps = good ? goodOrder : badOrder;
  const r = rebuilt(steps, changed ? [changed] : []);
  return (
    <div class="dockercache">
      <div class="row wrap">
        <label>Порядок инструкций
          <select value={good ? 'good' : 'bad'} onChange={(e) => setGood((e.target as HTMLSelectElement).value === 'good')}>
            <option value="bad">COPY . . до npm ci</option>
            <option value="good">Сначала package*.json и npm ci</option>
          </select>
        </label>
        <label>Что изменилось
          <select value={changed} onChange={(e) => setChanged((e.target as HTMLSelectElement).value)}>
            <option value="">ничего</option>
            <option value="src/app.ts">исходный код (src/app.ts)</option>
            <option value="package.json">зависимости (package.json)</option>
          </select>
        </label>
      </div>
      <ol class="dockerfile">
        {steps.map((s, i) => <li key={i} class={r[i] ? 'rebuilt' : 'cached'}><code>{s.cmd}</code> <span class="muted small">{r[i] ? '— пересборка' : '— из кэша'}</span></li>)}
      </ol>
      <p aria-live="polite">Пересобирается слоёв: <b>{r.filter(Boolean).length}</b> из {steps.length}. {steps[3].cmd.includes('npm ci') && r[3] ? 'Установка зависимостей выполняется заново (долго).' : 'Установка зависимостей берётся из кэша (быстро).'}</p>
    </div>
  );
}
