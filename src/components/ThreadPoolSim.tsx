import { useMemo, useState } from 'preact/hooks';
import { simulatePool } from '../engine/threadpool.ts';

const W = 640;
const ROW = 30;
const LEFT = 78;

/** Модель thread pool: смотри, как размер пула и число ядер влияют на «ступеньки» завершения CPU-задач. */
export function ThreadPoolSim() {
  const [size, setSize] = useState(4);
  const [tasks, setTasks] = useState(8);
  const [cores, setCores] = useState(4);
  const res = useMemo(() => simulatePool({ tasks, size, cores, duration: 100 }), [tasks, size, cores]);
  const sx = (t: number) => LEFT + (t / res.total) * (W - LEFT - 16);
  const rows = Math.min(size, tasks);
  const height = rows * ROW + 30;

  return (
    <div class="tpsim">
      <div class="row wrap">
        <label>Размер пула (UV_THREADPOOL_SIZE): <b>{size}</b>
          <input type="range" min={1} max={8} value={size} onInput={(e) => setSize(Number((e.target as HTMLInputElement).value))} />
        </label>
        <label>Задач: <b>{tasks}</b>
          <input type="range" min={1} max={12} value={tasks} onInput={(e) => setTasks(Number((e.target as HTMLInputElement).value))} />
        </label>
        <label>Ядер CPU: <b>{cores}</b>
          <input type="range" min={1} max={8} value={cores} onInput={(e) => setCores(Number((e.target as HTMLInputElement).value))} />
        </label>
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`Диаграмма выполнения ${tasks} задач в пуле из ${size} потоков на ${cores} ядрах`} style={{ width: '100%', height: 'auto' }}>
        {Array.from({ length: rows }, (_, th) => (
          <g key={th}>
            <text x="4" y={th * ROW + 20} font-size="12" fill="var(--text)">поток {th + 1}</text>
            {res.runs.filter((r) => r.thread === th).map((r) => (
              <g key={r.id}>
                <rect x={sx(r.start)} y={th * ROW + 4} width={Math.max(2, sx(r.finish) - sx(r.start) - 1)} height={ROW - 8} rx="4" fill="var(--accent-soft)" stroke="var(--accent)" />
                <text x={(sx(r.start) + sx(r.finish)) / 2} y={th * ROW + 20} font-size="11" text-anchor="middle" fill="var(--text)">#{r.id + 1}</text>
              </g>
            ))}
          </g>
        ))}
        <line x1={LEFT} x2={W - 16} y1={rows * ROW + 4} y2={rows * ROW + 4} stroke="var(--muted)" />
        <text x={LEFT} y={rows * ROW + 20} font-size="11" fill="var(--muted)">0</text>
        <text x={W - 16} y={rows * ROW + 20} font-size="11" text-anchor="end" fill="var(--muted)">{Math.round(res.total)} усл. ед.</text>
      </svg>
      <p>
        Все задачи завершатся за <b>{Math.round(res.total)}</b> усл. ед. (одна задача на свободном ядре = 100). Ступенек завершения: <b>{res.waves}</b>.
      </p>
      <ul class="muted">
        {size > cores && <li>Потоков больше, чем ядер: CPU-задачи делят ядра, ускорения нет. Увеличивать пул имеет смысл для операций, которые в основном ждут (файлы, DNS), а не считают.</li>}
        {size < Math.min(tasks, cores) && <li>Пул меньше числа задач и ядер: часть задач ждёт в очереди, хотя ядра свободны.</li>}
      </ul>
      <p class="model-note">Модель идеализирована: одинаковые CPU-задачи, без накладных расходов. Реальные времена проверь лабораторией <code>labs/m01/threadpool/pbkdf2.cjs</code>.</p>
    </div>
  );
}
