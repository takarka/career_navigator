import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useBank } from './useBank.ts';
import { modules } from '../content/modules.ts';
import { exportForChat, pickQuestions, scoreFromChecklist, sessionReport, weakModules, type Filter, type QKind, type Question } from '../engine/interview.ts';
import type { InterviewSession } from '../app/migrate.ts';
import { saveInterview, useProgress } from '../app/state.ts';
import { Markdown } from './Markdown.tsx';
import { copyText } from './clipboard.ts';

const kindLabel: Record<QKind, string> = { hr: 'HR', tech: 'Техническое', mgmt: 'Управленческое', live: 'Live coding', design: 'System design' };
type Mode = 'random' | 'weak' | 'hr' | 'tech' | 'mgmt' | 'module';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

interface Draft {
  answer: string;
  checked: boolean[];
  revealed: boolean;
  done: boolean;
}

export function MockInterview() {
  const progress = useProgress();
  const loaded = useBank();
  const bank = useMemo(() => loaded ?? [], [loaded]);
  const [mode, setMode] = useState<Mode>('random');
  const [moduleId, setModuleId] = useState('m01');
  const [count, setCount] = useState(5);
  const [timerOn, setTimerOn] = useState(false);
  const [session, setSession] = useState<{ id: string; qs: Question[] } | null>(null);
  const [idx, setIdx] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [finished, setFinished] = useState(false);
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('');
  const [sec, setSec] = useState(0);
  const timerRef = useRef<number | undefined>(undefined);

  const weak = useMemo(() => weakModules(progress, bank), [progress, bank]);

  const q = session?.qs[idx];
  useEffect(() => {
    setSec(0);
    if (!timerOn || !session || finished) return;
    timerRef.current = window.setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [idx, timerOn, session, finished]);

  const start = () => {
    const f: Filter = {};
    if (mode === 'hr' || mode === 'tech' || mode === 'mgmt') f.kinds = [mode];
    if (mode === 'module') f.modules = [moduleId];
    const seed = Date.now() % 100000;
    const qs = pickQuestions(bank, f, count, seed, mode === 'weak' ? weak : undefined);
    if (!qs.length) return;
    setSession({ id: `s-${Date.now()}`, qs });
    setIdx(0);
    setDrafts({});
    setFinished(false);
    setCopied('');
  };

  const draft: Draft = (q && drafts[q.id]) || { answer: '', checked: q ? q.keyPoints.map(() => false) : [], revealed: false, done: false };
  const patch = (p: Partial<Draft>) => q && setDrafts({ ...drafts, [q.id]: { ...draft, ...p } });

  const buildSession = (ds: Record<string, Draft> = drafts): InterviewSession => ({
    id: session!.id,
    date: new Date().toISOString().slice(0, 10),
    answers: session!.qs.map((qq) => {
      const d = ds[qq.id];
      return { qid: qq.id, answer: d?.answer ?? '', selfScore: d?.done ? scoreFromChecklist(d.checked.filter(Boolean).length, qq.keyPoints.length) : undefined };
    }),
  });

  const finishNow = () => {
    const merged = q ? { ...drafts, [q.id]: { ...draft, done: true } } : drafts;
    setDrafts(merged);
    saveInterview(buildSession(merged));
    setFinished(true);
  };

  if (!loaded) return <p class="muted" aria-busy="true">Загружаю банк вопросов…</p>;

  if (!session) {
    return (
      <div class="mock">
        <div class="row wrap">
          <label>Формат{' '}
            <select value={mode} onChange={(e) => setMode((e.target as HTMLSelectElement).value as Mode)}>
              <option value="random">Случайные вопросы</option>
              <option value="weak">Слабые темы</option>
              <option value="hr">HR</option>
              <option value="tech">Техническое</option>
              <option value="mgmt">Управленческое</option>
              <option value="module">По модулю</option>
            </select>
          </label>
          {mode === 'module' && (
            <label>Модуль{' '}
              <select value={moduleId} onChange={(e) => setModuleId((e.target as HTMLSelectElement).value)}>
                {modules.map((m) => <option key={m.id} value={m.id}>{m.num}. {m.title}</option>)}
              </select>
            </label>
          )}
          <label>Вопросов{' '}
            <input type="number" min={1} max={20} value={count} onInput={(e) => setCount(Math.max(1, Math.min(20, Number((e.target as HTMLInputElement).value) || 1)))} style={{ width: '4em' }} />
          </label>
          <label><input type="checkbox" checked={timerOn} onChange={() => setTimerOn(!timerOn)} /> Таймер на вопрос</label>
        </div>
        {mode === 'weak' && <p class="muted">{weak.length ? `Слабые темы по твоим тестам и оценкам: ${weak.join(', ')}.` : 'Данных о слабых темах пока нет: пройди тесты уроков или мок-интервью. Вопросы будут случайными.'}</p>}
        <p class="muted">В банке вопросов: {bank.length}. Эталонный ответ скрыт, пока не напишешь свой.</p>
        <button class="primary" onClick={start}>Начать интервью</button>
        {progress.interviewHistory.length > 0 && <p class="muted">Проведено интервью: {progress.interviewHistory.length}.</p>}
      </div>
    );
  }

  if (finished) {
    const s = buildSession();
    const rep = sessionReport(s, bank);
    const text = exportForChat(s, bank);
    return (
      <div class="mock">
        <h3>Итог интервью</h3>
        <p>Отвечено: <b>{rep.answered}</b> из {rep.total}. Средняя самооценка: <b>{rep.avg ? rep.avg.toFixed(1) : '—'}</b> из 10.</p>
        {rep.weak.length > 0 && <p>Слабые темы: {rep.weak.map((m) => modules.find((x) => x.id === m)?.title ?? m).join('; ')}.</p>}
        <div class="row">
          <button class="primary" onClick={async () => setCopied((await copyText(text)) ? 'ok' : 'fail')}>Скопировать ответы для разбора в чате</button>
          <button onClick={() => { setSession(null); setFinished(false); }}>Новое интервью</button>
        </div>
        <span aria-live="polite">{copied === 'ok' && 'Скопировано. Вставь текст в чат с Claude.'}{copied === 'fail' && 'Не удалось скопировать: выдели текст ниже вручную.'}</span>
        <details open={copied === 'fail'}><summary>Текст для разбора</summary><textarea readOnly rows={10} value={text} style={{ width: '100%' }} aria-label="Текст для разбора в чате" /></details>
      </div>
    );
  }

  const last = idx === session.qs.length - 1;
  const checkedN = draft.checked.filter(Boolean).length;
  return (
    <div class="mock">
      <p class="muted">Вопрос {idx + 1} из {session.qs.length} · {kindLabel[q!.kind]} · {q!.module}{timerOn && ` · ${fmt(sec)}`}</p>
      <h3>{q!.question}</h3>
      <label class="sr-only" for="mock-answer">Твой ответ</label>
      <textarea id="mock-answer" rows={6} style={{ width: '100%' }} placeholder="Ответь так, как сказал бы вслух интервьюеру…" value={draft.answer} disabled={draft.revealed} onInput={(e) => patch({ answer: (e.target as HTMLTextAreaElement).value })} />
      {!draft.revealed && (
        <div class="row">
          <button class="primary" onClick={() => patch({ revealed: true })} disabled={!draft.answer.trim()}>Отправить и показать эталон</button>
          <button onClick={() => patch({ revealed: true })}>Пропустить и показать эталон</button>
        </div>
      )}
      {draft.revealed && (
        <div class="reference">
          <div class="callout tip"><div class="callout-title">Эталонный ответ</div><Markdown text={q!.referenceAnswer} /></div>
          <fieldset>
            <legend>Самооценка: что из этого было в твоём ответе?</legend>
            {q!.keyPoints.map((kp, i) => (
              <label key={i} class="check-line"><input type="checkbox" checked={draft.checked[i]} onChange={() => patch({ checked: draft.checked.map((c, j) => (j === i ? !c : c)), done: true })} /> {kp}</label>
            ))}
            <p>Оценка: <b>{scoreFromChecklist(checkedN, q!.keyPoints.length)}</b> из 10</p>
          </fieldset>
          {q!.followUps.length > 0 && <details><summary>Возможные уточняющие вопросы</summary><ul>{q!.followUps.map((f) => <li key={f}>{f}</li>)}</ul></details>}
          <div class="row">
            {!last && <button class="primary" onClick={() => { patch({ done: true }); setIdx(idx + 1); }}>Следующий вопрос →</button>}
            {last && <button class="primary" onClick={finishNow}>Завершить и показать итог</button>}
          </div>
        </div>
      )}
      {!draft.revealed && last && <p class="muted">Это последний вопрос.</p>}
      {draft.revealed === false && idx > 0 && <button onClick={() => setIdx(idx - 1)}>← Предыдущий</button>}
    </div>
  );

}
