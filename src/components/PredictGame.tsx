import { useMemo, useState } from 'preact/hooks';
import { simulate, toSource } from '../engine/eventloop.ts';
import { scenarios } from '../content/m01/scenarios.ts';
import { CodeEditor } from './CodeEditor.tsx';
import { Markdown } from './Markdown.tsx';
import { useDark } from '../app/theme.ts';
import { toggle, useProgress } from '../app/state.ts';

const games = scenarios.filter((s) => s.deterministic);

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function PredictGame({ taskId }: { taskId?: string }) {
  const dark = useDark();
  const progress = useProgress();
  const [gi, setGi] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<'idle' | 'ok' | 'bad' | 'revealed'>('idle');
  const sc = games[gi];
  const answer = useMemo(() => simulate(sc.ops).log, [sc]);
  const source = useMemo(() => toSource(sc.ops), [sc]);
  const chips = useMemo(() => {
    let attempt = 0;
    let shuffled = seededShuffle(answer, sc.id.length * 7919 + 13);
    // чтобы порядок на экране не совпал с ответом
    while (shuffled.join('|') === answer.join('|') && attempt++ < 5) shuffled = seededShuffle(answer, attempt * 31 + 7);
    return shuffled;
  }, [answer, sc]);

  const solved = games.filter((g) => progress.predict[g.id]).length;

  const check = () => {
    const ok = picked.length === answer.length && picked.every((p, i) => p === answer[i]);
    if (ok) {
      setResult('ok');
      toggle('predict', sc.id, true);
      if (taskId && games.every((g) => g.id === sc.id || progress.predict[g.id])) toggle('tasks', taskId, true);
    } else setResult('bad');
  };
  const go = (i: number) => {
    setGi(i);
    setPicked([]);
    setResult('idle');
  };

  return (
    <div class="predict">
      <div class="sim-pick">
        {games.map((g, i) => (
          <button key={g.id} class={`chip-btn ${i === gi ? 'on' : ''} ${progress.predict[g.id] ? 'done' : ''}`} onClick={() => go(i)}>
            {progress.predict[g.id] ? '✓ ' : ''}{g.title}
          </button>
        ))}
      </div>
      <p class="muted">Решено: {solved} из {games.length}. {sc.intro}</p>
      <CodeEditor value={source} readOnly dark={dark} />
      <div class="pane-title">Твой порядок вывода (нажимай строки по очереди)</div>
      <ol class="answer-slots">
        {answer.map((_, i) => (
          <li key={i} class={result === 'bad' && picked[i] !== answer[i] ? 'wrong' : result === 'ok' ? 'right' : ''}>
            {picked[i] ?? <span class="empty">?</span>}
          </li>
        ))}
      </ol>
      <div class="chips pool">
        {chips.map((c) => (
          <button key={c} class="chip-btn" disabled={picked.includes(c) || result === 'ok' || result === 'revealed'} onClick={() => { setPicked([...picked, c]); setResult('idle'); }}>
            {c}
          </button>
        ))}
      </div>
      <div class="row">
        <button class="primary" onClick={check} disabled={picked.length !== answer.length || result === 'ok'}>Проверить</button>
        <button onClick={() => { setPicked([]); setResult('idle'); }}>Сбросить</button>
        <button onClick={() => { setPicked(answer); setResult('revealed'); }}>Показать ответ</button>
        {gi < games.length - 1 && <button onClick={() => go(gi + 1)}>Следующий →</button>}
      </div>
      {result === 'ok' && <div class="callout tip"><b>Верно!</b> Теперь прочитай разбор и сравни с симулятором выше.</div>}
      {result === 'bad' && <div class="callout warn"><b>Пока не так.</b> Красным отмечены позиции, где порядок неверный. Подумай, какая очередь очищается раньше.</div>}
      {(result === 'ok' || result === 'revealed') && (
        <div class="explain-open">
          <b>Разбор</b>
          <ol>{sc.explanation.map((e, i) => <li key={i}><Markdown text={e} inline /></li>)}</ol>
        </div>
      )}
    </div>
  );
}
