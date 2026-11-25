import { useEffect, useMemo, useState } from 'preact/hooks';
import { buildTree, flameRects, hottest, type CpuProfile, type Rect } from '../engine/cpuprofile.ts';
import { curve, mmc } from '../engine/queueing.ts';
import { Chart } from './Chart.tsx';

/* ---------- Flame graph ---------- */
const ROW = 22;

export function FlameGraph() {
  const [profile, setProfile] = useState<CpuProfile | null>(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<Rect | null>(null);
  useEffect(() => {
    void import('../content/m10/sample.cpuprofile.json').then((m) => setProfile(m.default as unknown as CpuProfile));
  }, []);
  const tree = useMemo(() => (profile ? buildTree(profile) : null), [profile]);
  const rects = useMemo(() => (tree ? flameRects(tree, 0.004) : []), [tree]);
  const top = useMemo(() => (tree ? hottest(tree, 6) : []), [tree]);
  const depth = Math.max(0, ...rects.map((r) => r.depth)) + 1;
  const W = 900;
  const hue = (name: string) => {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  };
  const load = async (f: File) => {
    try {
      const p = JSON.parse(await f.text()) as CpuProfile;
      if (!Array.isArray(p.nodes) || !Array.isArray(p.samples)) throw new Error('нет полей nodes/samples');
      setProfile(p);
      setSel(null);
      setErr('');
    } catch (e) {
      setErr(`Не удалось прочитать профиль: ${(e as Error).message}`);
    }
  };
  if (!tree) return <p class="muted" aria-busy="true">Загружаю профиль…</p>;
  return (
    <div class="flame">
      <p class="muted small">Ширина блока — доля времени. Блок снизу вызывает блоки над ним. Широкие «плато» наверху — функции, которые тратят время сами. Нажми на блок, чтобы увидеть подробности.</p>
      <div class="flame-scroll">
        <svg viewBox={`0 0 ${W} ${depth * ROW + 4}`} role="img" aria-label="Flame graph CPU-профиля" style={{ width: '100%', minWidth: '600px', height: 'auto' }}>
          {rects.map((r, i) => (
            <g key={i} onClick={() => setSel(r)} style={{ cursor: 'pointer' }}>
              <rect x={r.x * W + 0.5} y={(depth - 1 - r.depth) * ROW + 2} width={Math.max(0.5, r.w * W - 1)} height={ROW - 2} fill={`hsl(${hue(r.name)} 55% ${sel === r ? 45 : 68}%)`} stroke="var(--border)" />
              {r.w * W > 50 && <text x={r.x * W + 4} y={(depth - 1 - r.depth) * ROW + 16} font-size="11" fill="#111">{r.name.slice(0, Math.floor((r.w * W) / 6.5))}</text>}
            </g>
          ))}
        </svg>
      </div>
      <p aria-live="polite">{sel ? <>Выбрано: <b>{sel.name}</b> — всего {(sel.total / 1000).toFixed(1)} мс ({((sel.total / tree.total) * 100).toFixed(1)}%), само {(sel.self / 1000).toFixed(1)} мс. {sel.url && <span class="muted">{sel.url}:{sel.line}</span>}</> : 'Блок не выбран.'}</p>
      <div class="pane-title">Самые «горячие» функции (собственное время)</div>
      <ol>{top.map((h) => <li key={`${h.name}${h.line}`}><code>{h.name}</code> — {(h.share * 100).toFixed(1)}% ({(h.self / 1000).toFixed(0)} мс)</li>)}</ol>
      <div class="row">
        <label>Загрузить свой профиль (.cpuprofile): <input type="file" accept=".cpuprofile,application/json" onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void load(f); }} /></label>
      </div>
      {err && <p class="callout warn" role="alert">{err}</p>}
    </div>
  );
}

/* ---------- Кривая очереди ---------- */
export function QueueCurve() {
  const [servers, setServers] = useState(1);
  const [mu, setMu] = useState(100); // запросов/с на сервер
  const [load, setLoad] = useState(70);
  const lambda = (load / 100) * servers * mu;
  const r = mmc({ lambda, mu, servers });
  const pts = useMemo(() => curve(mu, servers).map((p) => [p.rho * 100, p.w * 1000] as [number, number]), [mu, servers]);
  return (
    <div class="queuecurve">
      <div class="row wrap">
        <label>Воркеров/потоков: <b>{servers}</b><input type="range" min={1} max={8} value={servers} onInput={(e) => setServers(Number((e.target as HTMLInputElement).value))} /></label>
        <label>Скорость одного: <b>{mu} запр/с</b><input type="range" min={10} max={500} step={10} value={mu} onInput={(e) => setMu(Number((e.target as HTMLInputElement).value))} /></label>
        <label>Загрузка: <b>{load}%</b><input type="range" min={5} max={98} value={load} onInput={(e) => setLoad(Number((e.target as HTMLInputElement).value))} /></label>
      </div>
      <Chart title="Среднее время в системе в зависимости от загрузки" xLabel="загрузка, %" yLabel="время ответа, мс" series={[{ name: 'среднее время ответа', points: pts }]} height={240} />
      <p aria-live="polite">При загрузке {load}%: вероятность ожидания <b>{(r.pWait * 100).toFixed(0)}%</b>, ожидание в очереди <b>{(r.wq * 1000).toFixed(1)} мс</b>, полное время <b>{(r.w * 1000).toFixed(1)} мс</b> (чистое обслуживание {(1000 / mu).toFixed(1)} мс), в системе в среднем <b>{r.l.toFixed(1)}</b> запросов.</p>
      <p class="model-note">Модель M/M/c: формулы проверены имитацией очереди (отклонение менее 6%). Реальные системы с неравномерным временем обслуживания ведут себя хуже: «колено» кривой наступает раньше.</p>
    </div>
  );
}
