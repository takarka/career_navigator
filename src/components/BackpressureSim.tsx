import { useMemo, useState } from 'preact/hooks';
import { simulateBackpressure } from '../engine/backpressure.ts';
import { SimPlayer } from './SimPlayer.tsx';
import { Chart } from './Chart.tsx';

/** Симулятор backpressure: производитель, буфер Writable, медленный приёмник. Модель сверена с реальным Node. */
export function BackpressureSim() {
  const [respect, setRespect] = useState(true);
  const [hwm, setHwm] = useState(4);
  const [perTick, setPerTick] = useState(5);
  const [step, setStep] = useState(0);
  const res = useMemo(() => simulateBackpressure({ total: 100, perTick, highWaterMark: hwm, respect }), [respect, hwm, perTick]);
  const f = res.frames[Math.min(step, res.frames.length - 1)];
  const fill = Math.min(1, f.buffered / Math.max(hwm, 1));

  return (
    <div class="bpsim">
      <div class="row wrap">
        <label><input type="checkbox" checked={respect} onChange={() => { setRespect(!respect); setStep(0); }} /> Производитель учитывает write() === false и ждёт drain</label>
        <label>highWaterMark: <b>{hwm}</b>
          <input type="range" min={1} max={16} value={hwm} onInput={(e) => { setHwm(Number((e.target as HTMLInputElement).value)); setStep(0); }} />
        </label>
        <label>Скорость производителя: <b>{perTick}</b> эл. за виток (приёмник — 1)
          <input type="range" min={1} max={10} value={perTick} onInput={(e) => { setPerTick(Number((e.target as HTMLInputElement).value)); setStep(0); }} />
        </label>
      </div>
      <SimPlayer total={res.frames.length} index={step} setIndex={setStep} resetKey={`${respect}-${hwm}-${perTick}`} />
      <div class="bpviz" aria-hidden="true">
        <div class="bpbuf"><span class={fill >= 1 ? 'full' : ''} style={{ width: `${Math.min(100, (f.buffered / Math.max(res.maxBuffered, hwm)) * 100)}%` }} /></div>
      </div>
      <p aria-live="polite">
        Виток <b>{f.iteration}</b>: записано <b>{f.written}</b> из 100, обработано <b>{f.processed}</b>, в буфере <b>{f.buffered}</b> (лимит highWaterMark = {hwm}). {f.note}
      </p>
      <p>
        Итог: максимум элементов в буфере — <b>{res.maxBuffered}</b>{respect ? '' : ', память растёт, потому что производитель не ждёт'}; событий drain: <b>{res.drains}</b>.
      </p>
      <Chart title="Размер буфера по виткам" xLabel="виток цикла" yLabel="элементов в буфере" series={[{ name: 'буфер', points: res.frames.map((x) => [x.iteration, x.buffered] as [number, number]) }]} height={200} />
      <p class="model-note">Модель сверена с реальным Node: <code>labs/m01/streams/backpressure.cjs</code> даёт те же максимум буфера, число обработанных элементов и событий drain.</p>
    </div>
  );
}
