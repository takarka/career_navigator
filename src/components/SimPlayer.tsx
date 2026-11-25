import { useEffect, useRef, useState } from 'preact/hooks';

interface Props {
  total: number;
  index: number;
  setIndex: (i: number) => void;
  /** Ключ сброса, например id сценария. */
  resetKey: string;
}

/** Общие элементы управления для всех симуляторов: пауза, шаг, назад, скорость, перемотка. */
export function SimPlayer({ total, index, setIndex, resetKey }: Props) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const idx = useRef(index);
  idx.current = index;

  useEffect(() => {
    setPlaying(false);
  }, [resetKey]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      if (idx.current >= total - 1) {
        setPlaying(false);
        return;
      }
      setIndex(idx.current + 1);
    }, 1100 / speed);
    return () => clearInterval(t);
  }, [playing, speed, total, setIndex]);

  const atEnd = index >= total - 1;
  return (
    <div class="player" role="group" aria-label="Управление симуляцией">
      <button onClick={() => { setPlaying(false); setIndex(0); }} title="В начало" aria-label="В начало">⏮</button>
      <button onClick={() => { setPlaying(false); setIndex(Math.max(0, index - 1)); }} disabled={index === 0} title="Шаг назад" aria-label="Шаг назад">◀</button>
      <button
        class="primary"
        onClick={() => {
          if (atEnd) setIndex(0);
          setPlaying(!playing);
        }}
      >
        {playing ? '⏸ Пауза' : atEnd ? '↺ Заново' : '▶ Играть'}
      </button>
      <button onClick={() => { setPlaying(false); setIndex(Math.min(total - 1, index + 1)); }} disabled={atEnd} title="Шаг вперёд" aria-label="Шаг вперёд">▶|</button>
      <input
        type="range"
        min={0}
        max={total - 1}
        value={index}
        onInput={(e) => { setPlaying(false); setIndex(Number((e.target as HTMLInputElement).value)); }}
        aria-label="Позиция"
      />
      <span class="player-count">{index + 1} / {total}</span>
      <select value={speed} onChange={(e) => setSpeed(Number((e.target as HTMLSelectElement).value))} aria-label="Скорость">
        <option value={0.5}>0.5×</option>
        <option value={1}>1×</option>
        <option value={2}>2×</option>
        <option value={4}>4×</option>
      </select>
    </div>
  );
}
