import { useState } from 'preact/hooks';
import { setStory, useProgress } from '../app/state.ts';
import { copyText } from './clipboard.ts';

/** Конструктор рассказа о себе на 60–90 секунд и ответа на вопрос «почему Middle». Шаблоны — каркас, пользователь заполняет сам. */
const PARTS = [
  { key: 'situation', label: 'Сейчас', hint: 'Роль, стаж, основной стек и в чём ты силён (1–2 предложения).' },
  { key: 'task', label: 'Прошлое', hint: '2–3 ключевых проекта и результат каждого, без перечисления всех технологий подряд.' },
  { key: 'action', label: 'Почему эта роль', hint: 'Что тебя привлекает в этой вакансии и компании, связь с твоими целями.' },
  { key: 'result', label: 'Чем полезен', hint: 'Что конкретно ты принесёшь команде в первые месяцы.' },
] as const;

const WHY_MIDDLE = [
  { id: 'focus', title: 'Фокус на разработке', text: 'За последние годы мне пришлось много заниматься управлением, а мне ближе инженерная работа: проектирование, код, разбор сложных проблем. Я осознанно выбираю роль, где могу сосредоточиться на backend-разработке, и готов начинать с уровня, который соответствует ожиданиям команды.' },
  { id: 'depth', title: 'Углубление в стек', text: 'Моя сильная сторона — широкий опыт, но в Node.js-бэкенде с брокерами сообщений я хочу углубиться. Эта позиция даёт мне возможность делать это на реальных задачах, и я понимаю, что в новых для меня областях я начинаю как Middle.' },
  { id: 'product', title: 'Интерес к направлению', text: 'Меня интересует именно это направление (интеграции и обработка событий). Уровень для меня вторичен: важнее задачи и команда, у которой я могу многому научиться и в которой смогу быстро принести пользу.' },
];

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export function IntroBuilder() {
  const progress = useProgress();
  const intro = progress.stories['intro'] ?? { title: 'Рассказ о себе', situation: '', task: '', action: '', result: '', lesson: '' };
  const why = progress.stories['why-middle'] ?? { title: 'Почему Middle', situation: '', task: '', action: '', result: '', lesson: '' };
  const [copied, setCopied] = useState(false);
  const total = PARTS.reduce((n, p) => n + words(intro[p.key]), 0);
  // средняя скорость устной речи ≈ 130 слов в минуту
  const seconds = Math.round((total / 130) * 60);
  const status = total === 0 ? '' : seconds < 55 ? 'коротковато (цель 60–90 секунд)' : seconds > 100 ? 'длинновато (цель 60–90 секунд)' : 'в пределах нормы';

  return (
    <div class="intro-builder">
      <h3>Рассказ о себе</h3>
      {PARTS.map((p) => (
        <div key={p.key} class="field">
          <label for={`intro-${p.key}`}><b>{p.label}</b></label>
          <div class="muted">{p.hint}</div>
          <textarea id={`intro-${p.key}`} rows={3} style={{ width: '100%' }} value={intro[p.key]} onInput={(e) => setStory('intro', { ...intro, [p.key]: (e.target as HTMLTextAreaElement).value })} />
        </div>
      ))}
      <p>Слов: <b>{total}</b>. Примерное время вслух: <b>{seconds} с</b> {status && `— ${status}`}.</p>
      <div class="row">
        <button onClick={async () => setCopied(await copyText(PARTS.map((p) => `${p.label}: ${intro[p.key].trim()}`).join('\n')))}>Скопировать</button>
        <span aria-live="polite">{copied && 'Скопировано'}</span>
      </div>

      <h3>Почему Middle после Senior и Lead</h3>
      <p class="muted">Три честных шаблона. Выбери ближайший к твоей настоящей причине и перепиши своими словами. Не используй формулировку, с которой не согласен.</p>
      <div class="sim-pick" role="group" aria-label="Шаблоны ответа">
        {WHY_MIDDLE.map((w) => (
          <button key={w.id} onClick={() => setStory('why-middle', { ...why, lesson: w.id, situation: w.text })}>{w.title}</button>
        ))}
      </div>
      <label class="sr-only" for="why-middle-text">Мой ответ на вопрос «почему Middle»</label>
      <textarea id="why-middle-text" rows={5} style={{ width: '100%' }} value={why.situation} placeholder="Выбери шаблон выше или напиши свой ответ" onInput={(e) => setStory('why-middle', { ...why, situation: (e.target as HTMLTextAreaElement).value })} />
      <ul class="checks">
        <li class={words(why.situation) > 0 && words(why.situation) <= 90 ? 'ok' : ''}>Ответ укладывается в 30–40 секунд (до 90 слов)</li>
        <li class={words(why.situation) > 0 && !/(не справ|уволили|выгнали|оправдан)/i.test(why.situation) ? 'ok' : ''}>Без оправданий и негатива о прошлой работе</li>
      </ul>
    </div>
  );
}
