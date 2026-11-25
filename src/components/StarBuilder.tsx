import { useEffect, useRef, useState } from 'preact/hooks';
import type { StarStory } from '../app/migrate.ts';
import { setStory, useProgress } from '../app/state.ts';
import { copyText } from './clipboard.ts';

const FIELDS: { key: keyof Omit<StarStory, 'title'>; label: string; hint: string }[] = [
  { key: 'situation', label: 'Situation (ситуация)', hint: 'Где и когда это было? Какой контекст, какая команда, какие сроки и ставки?' },
  { key: 'task', label: 'Task (задача)', hint: 'За что отвечал именно ты? Какая цель или проблема стояла перед тобой?' },
  { key: 'action', label: 'Action (действия)', hint: 'Что сделал ты сам (не «мы»)? Какие решения принял и почему? Какие альтернативы отверг?' },
  { key: 'result', label: 'Result (результат)', hint: 'Чем закончилось? Цифры: время, ошибки, деньги, нагрузка. Если цифр нет, опиши наблюдаемый эффект.' },
  { key: 'lesson', label: 'Вывод', hint: 'Что ты теперь делаешь иначе?' },
];

export const STORY_SLOTS = [
  { id: 'optimization', title: 'Оптимизация' },
  { id: 'incident', title: 'Инцидент в продакшене' },
  { id: 'architecture', title: 'Архитектурное решение' },
  { id: 'conflict', title: 'Конфликт или код-ревью' },
];

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const hasNumber = (s: string) => /\d/.test(s);
const empty = (title: string): StarStory => ({ title, situation: '', task: '', action: '', result: '', lesson: '' });

/** Конструктор STAR-историй. Ничего не генерирует за пользователя: только структура, подсказки и проверки. */
export function StarBuilder() {
  const progress = useProgress();
  const [slot, setSlot] = useState(STORY_SLOTS[0].id);
  const saved = progress.stories[slot] ?? empty(STORY_SLOTS.find((s) => s.id === slot)!.title);
  const [timer, setTimer] = useState<number | null>(null);
  const tick = useRef<number | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => () => clearInterval(tick.current), []);

  const update = (key: keyof StarStory, value: string) => setStory(slot, { ...saved, [key]: value });
  const total = FIELDS.reduce((n, f) => n + words(saved[f.key]), 0);
  const startTimer = () => {
    clearInterval(tick.current);
    setTimer(120);
    tick.current = window.setInterval(() => setTimer((t) => (t === null || t <= 0 ? 0 : t - 1)), 1000);
  };
  const exportText = `${saved.title}\n\n` + FIELDS.map((f) => `${f.label}:\n${saved[f.key].trim() || '—'}`).join('\n\n');

  const checks = [
    { ok: words(saved.action) >= 20, text: 'В «Действиях» достаточно подробностей (от 20 слов)' },
    { ok: hasNumber(saved.result), text: 'В результате есть измеримый показатель (число)' },
    { ok: !/\bмы\b/i.test(saved.action) || /\bя\b/i.test(saved.action), text: 'Видно, что сделал именно ты («я», а не только «мы»)' },
    { ok: total >= 120 && total <= 300, text: `Объём подходит для ответа на 1.5–2 минуты (сейчас ${total} слов, ориентир 120–300)` },
  ];

  return (
    <div class="star">
      <div class="sim-pick" role="group" aria-label="Выбор истории">
        {STORY_SLOTS.map((s) => (
          <button key={s.id} class={`chip-btn ${s.id === slot ? 'on' : ''}`} onClick={() => setSlot(s.id)} aria-pressed={s.id === slot}>
            {progress.stories[s.id] && words(FIELDS.map((f) => progress.stories[s.id][f.key]).join(' ')) > 0 ? '✓ ' : ''}{s.title}
          </button>
        ))}
      </div>
      <p class="muted">Историю пишешь ты сам по своему реальному опыту. Учебник не придумывает факты за тебя. Текст хранится только в этом браузере.</p>
      {FIELDS.map((f) => (
        <div key={f.key} class="field">
          <label for={`star-${slot}-${f.key}`}><b>{f.label}</b></label>
          <div class="muted">{f.hint}</div>
          <textarea id={`star-${slot}-${f.key}`} rows={f.key === 'action' ? 5 : 3} style={{ width: '100%' }} value={saved[f.key]} onInput={(e) => update(f.key, (e.target as HTMLTextAreaElement).value)} />
          <small class="muted">слов: {words(saved[f.key])}</small>
        </div>
      ))}
      <ul class="checks" aria-label="Чек-лист истории">
        {checks.map((c) => <li key={c.text} class={c.ok ? 'ok' : ''}><span aria-hidden="true">{c.ok ? '✓' : '○'}</span> <span class="sr-only">{c.ok ? 'выполнено:' : 'не выполнено:'}</span> {c.text}</li>)}
      </ul>
      <div class="row">
        <button onClick={startTimer}>Таймер 2 минуты</button>
        {timer !== null && <span aria-live="off">Осталось: {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, '0')}{timer === 0 ? ' — время вышло' : ''}</span>}
        <button onClick={async () => { setCopied(await copyText(exportText)); }}>Скопировать историю</button>
        <span aria-live="polite">{copied && 'Скопировано'}</span>
      </div>
    </div>
  );
}
