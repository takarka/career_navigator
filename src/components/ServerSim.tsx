import { useMemo, useState } from 'preact/hooks';
import { simulateServer } from '../engine/serversim.ts';
import { Chart } from './Chart.tsx';

/** Модель сервера: поток запросов, доля тяжёлых, вынос в воркеры. Показывает задержки лёгких запросов. */
export function ServerSim() {
  const [rps, setRps] = useState(20);
  const [share, setShare] = useState(5);
  const [heavyMs, setHeavyMs] = useState(200);
  const [workers, setWorkers] = useState(0);
  const res = useMemo(() => simulateServer({ rps, heavyShare: share / 100, lightMs: 5, heavyMs, workers, seconds: 20, seed: 11 }), [rps, share, heavyMs, workers]);

  // задержка лёгких запросов по времени: усредняем по секундам, чтобы график был читаемым
  const points = useMemo(() => {
    const buckets = new Map<number, number[]>();
    for (const r of res.reqs) if (!r.heavy) {
      const s = Math.floor(r.at / 1000);
      buckets.set(s, [...(buckets.get(s) ?? []), r.latency]);
    }
    return [...buckets].sort((a, b) => a[0] - b[0]).map(([s, v]) => [s, Math.max(...v)] as [number, number]);
  }, [res]);

  return (
    <div class="srvsim">
      <div class="row wrap">
        <label>Запросов в секунду: <b>{rps}</b>
          <input type="range" min={5} max={60} value={rps} onInput={(e) => setRps(Number((e.target as HTMLInputElement).value))} />
        </label>
        <label>Доля тяжёлых: <b>{share}%</b>
          <input type="range" min={0} max={30} value={share} onInput={(e) => setShare(Number((e.target as HTMLInputElement).value))} />
        </label>
        <label>Тяжёлый запрос: <b>{heavyMs} мс</b>
          <input type="range" min={50} max={500} step={50} value={heavyMs} onInput={(e) => setHeavyMs(Number((e.target as HTMLInputElement).value))} />
        </label>
        <label>Воркеров: <b>{workers === 0 ? 'нет (всё в главном потоке)' : workers}</b>
          <input type="range" min={0} max={4} value={workers} onInput={(e) => setWorkers(Number((e.target as HTMLInputElement).value))} />
        </label>
      </div>
      <Chart title="Худшая задержка лёгких запросов по секундам" xLabel="секунда" yLabel="задержка, мс" series={[{ name: 'лёгкие запросы (макс. за секунду)', points: points.length ? points : [[0, 0]] }]} />
      <table>
        <thead><tr><th></th><th>p50, мс</th><th>p95, мс</th></tr></thead>
        <tbody>
          <tr><th scope="row">лёгкие запросы (5 мс работы)</th><td>{res.light.p50.toFixed(0)}</td><td>{res.light.p95.toFixed(0)}</td></tr>
          <tr><th scope="row">тяжёлые запросы</th><td>{res.heavy.p50.toFixed(0)}</td><td>{res.heavy.p95.toFixed(0)}</td></tr>
        </tbody>
      </table>
      <p>Максимальная очередь к главному потоку: <b>{res.maxQueue}</b>.</p>
      <p class="model-note">Модель: один главный поток, воркеры считают параллельно, накладные расходы на передачу данных не учитываются (в реальности они есть и растут с размером данных).</p>
    </div>
  );
}
