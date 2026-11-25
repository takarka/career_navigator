import { useEffect, useRef, useState } from 'preact/hooks';
import { findLessonRef, flatLessons, modules, priorityLabel } from '../content/modules.ts';
import { isReady, loadLesson } from '../content/lessons.ts';
import type { Lesson } from '../content/types.ts';
import { BlockView } from '../components/Blocks.tsx';
import { Sandbox } from '../components/Sandbox.tsx';
import { modeInfo } from '../components/TaskCard.tsx';
import { LazyWidget } from '../components/widgets.tsx';
import { Quiz } from '../components/Quiz.tsx';
import { buildSummary } from '../content/summary.ts';
import { loadAllLessons } from '../content/lessons.ts';
import type { QuizQuestion } from '../content/types.ts';
import { Toc } from '../components/Toc.tsx';
import { Notes } from '../components/Notes.tsx';
import { exportProgress, importProgress, setDetail, toggle, useProgress } from './state.ts';
import { ensureIndex, search } from './search.ts';
import { href } from './router.ts';
import { weakModules } from '../engine/interview.ts';
import type { Question } from '../engine/interview.ts';

function moduleStats(id: string, progress: ReturnType<typeof useProgress>) {
  const m = modules.find((x) => x.id === id)!;
  const ready = m.lessons.filter((l) => isReady(l.id));
  const done = m.lessons.filter((l) => progress.lessons[l.id]);
  return { total: m.lessons.length, ready: ready.length, done: done.length };
}

export function Home() {
  const progress = useProgress();
  const file = useRef<HTMLInputElement>(null);
  const all = flatLessons();
  const [bank, setBank] = useState<Question[]>([]);
  const needBank = progress.interviewHistory.length > 0;
  useEffect(() => {
    if (needBank) import('../content/bank.ts').then((m) => m.getBank()).then(setBank, () => {});
  }, [needBank]);
  const weak = weakModules(progress, bank).slice(0, 4);
  const readyCount = all.filter((x) => isReady(x.ref.id)).length;
  const doneCount = all.filter((x) => progress.lessons[x.ref.id]).length;

  const doExport = () => {
    const blob = new Blob([exportProgress()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'textbook-progress.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div class="page">
      <section class="hero">
        <h1>Node.js Backend: интерактивный учебник</h1>
        <p>Подготовка к собеседованию на Middle Node.js-разработчика. Читай, трогай симуляторы, решай задачи и проверяй себя.</p>
        <div class="legend">
          {(Object.keys(modeInfo) as (keyof typeof modeInfo)[]).map((k) => (
            <span key={k} class={`badge ${k}`} title={modeInfo[k].hint}>{modeInfo[k].icon} {modeInfo[k].label}</span>
          ))}
          <span class="badge model">модель</span>
        </div>
        <p class="muted">Готово уроков: <b>{readyCount}</b> из {all.length}. Пройдено: <b>{doneCount}</b>.</p>
        <div class="row">
          <a class="btn primary" href={href.lesson('m01-l02')}>Начать с event loop →</a>
          <a class="btn" href={href.sandbox()}>JS-песочница</a>
        </div>
      </section>
      {weak.length > 0 && (
        <section class="weak-topics">
          <h2>Слабые темы</h2>
          <p class="muted">По результатам тестов, самооценки и мок-интервью. Начни с них.</p>
          <ul class="lesson-list">
            {weak.map((id) => {
              const m = modules.find((x) => x.id === id);
              return m ? <li key={id}><a href={href.module(id)}>{m.num}. {m.title}</a></li> : null;
            })}
          </ul>
        </section>
      )}
      <section>
        <h2>Модули</h2>
        <div class="grid">
          {modules.map((m) => {
            const st = moduleStats(m.id, progress);
            return (
              <a key={m.id} class={`card prio-${m.priority}`} href={href.module(m.id)}>
                <div class="card-top"><span class="num">{m.num}</span><span class={`prio ${m.priority}`}>{priorityLabel[m.priority]}</span></div>
                <h3>{m.title}</h3>
                <p>{m.summary}</p>
                <div class="bar" title={`пройдено ${st.done} из ${st.total}`}><span style={{ width: `${(st.done / st.total) * 100}%` }} /></div>
                <small class="muted">уроков: {st.total} · готово к чтению: {st.ready}</small>
              </a>
            );
          })}
        </div>
      </section>
      <section>
        <h2>Прогресс</h2>
        <p class="muted">Прогресс хранится в этом браузере. Сохрани его в файл, чтобы не потерять при очистке данных или переносе на другое устройство.</p>
        <div class="row">
          <button onClick={doExport}>Экспорт в файл</button>
          <button onClick={() => file.current?.click()}>Импорт из файла</button>
          <input
            ref={file}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (!f) return;
              if (!importProgress(await f.text())) alert('Не удалось прочитать файл прогресса');
            }}
          />
        </div>
      </section>
    </div>
  );
}

function ModuleSummary({ id }: { id: string }) {
  const [qs, setQs] = useState<QuizQuestion[] | null>(null);
  const [run, setRun] = useState(0);
  const start = async () => {
    const m = modules.find((x) => x.id === id)!;
    const ids = new Set(m.lessons.map((l) => l.id));
    const all = await loadAllLessons();
    setQs(buildSummary(all.filter((l) => ids.has(l.id)), 12, Date.now() % 100000));
    setRun((r) => r + 1);
  };
  return (
    <section class="module-summary">
      <h2>Сводный тест модуля</h2>
      <p class="muted">12 вопросов из тестов уроков модуля. Результат влияет на «слабые темы».</p>
      {qs ? <Quiz key={run} id={`${id}-summary`} title="Сводный тест" questions={qs} /> : null}
      <button onClick={start}>{qs ? 'Другой набор вопросов' : 'Начать'}</button>
    </section>
  );
}

export function ModulePage({ id }: { id: string }) {
  const progress = useProgress();
  const m = modules.find((x) => x.id === id);
  if (!m) return <div class="page"><p>Модуль не найден. <a href={href.home()}>На главную</a></p></div>;
  return (
    <div class="page">
      <nav class="crumbs"><a href={href.home()}>Главная</a> › Модуль {m.num}</nav>
      <h1>Модуль {m.num}. {m.title}</h1>
      <p class="lead">{m.summary}</p>
      <ol class="lesson-list">
        {m.lessons.map((l) => {
          const ready = isReady(l.id);
          return (
            <li key={l.id} class={ready ? '' : 'soon'}>
              <a href={href.lesson(l.id)}>
                <span class="check">{progress.lessons[l.id] ? '✓' : ready ? '○' : '·'}</span>
                <span class="ltitle">{l.title}{l.summary && <small>{l.summary}</small>}</span>
                {!ready && <span class="soon-tag">скоро</span>}
              </a>
            </li>
          );
        })}
      </ol>
      <ModuleSummary id={id} />
    </div>
  );
}

export function LessonPage({ id }: { id: string }) {
  const progress = useProgress();
  const [lesson, setLesson] = useState<Lesson | undefined>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    if (isReady(id)) {
      loadLesson(id).then(
        (l) => alive && setLesson(l),
        () => alive && setFailed(true),
      );
    }
    return () => {
      alive = false;
    };
  }, [id]);
  const found = findLessonRef(id);
  if (!found) return <div class="page"><p>Урок не найден. <a href={href.home()}>На главную</a></p></div>;
  const { module: m, ref } = found;
  const all = flatLessons();
  const pos = all.findIndex((x) => x.ref.id === id);
  const prev = all[pos - 1];
  const next = all[pos + 1];

  return (
    <div class="page lesson">
      <nav class="crumbs"><a href={href.home()}>Главная</a> › <a href={href.module(m.id)}>Модуль {m.num}. {m.title}</a></nav>
      <h1>{ref.title}</h1>
      {isReady(id) && !lesson && !failed && <p class="muted" aria-busy="true">Загрузка урока…</p>}
      {failed && <div class="callout warn" role="alert"><b>Не удалось загрузить урок.</b> Обновите страницу.</div>}
      {!isReady(id) && (
        <div class="callout info">
          <div class="callout-title">🚧 Урок ещё в разработке</div>
          <p>Содержание появится по плану реализации. Сейчас готов урок про event loop в модуле 1 — он задаёт формат для остальных.</p>
        </div>
      )}
      {lesson && (
        <div class="lesson-tools">
          <div class="seg" role="group" aria-label="Режим чтения">
            <button class={progress.detail ? '' : 'on'} aria-pressed={!progress.detail} onClick={() => setDetail(false)}>Коротко</button>
            <button class={progress.detail ? 'on' : ''} aria-pressed={progress.detail} onClick={() => setDetail(true)}>Подробно</button>
          </div>
          <Toc lessonId={id} />
        </div>
      )}
      {lesson?.blocks.map((b, i) => (b.t === 'md' && b.detail && !progress.detail ? null : <BlockView key={i} block={b} />))}
      {lesson && <Notes lessonId={id} />}
      {lesson && (
        <label class="donebox big">
          <input type="checkbox" checked={!!progress.lessons[id]} onChange={() => toggle('lessons', id)} /> Урок пройден
        </label>
      )}
      <nav class="pager">
        {prev ? <a href={href.lesson(prev.ref.id)}>← {prev.ref.title}</a> : <span />}
        {next ? <a href={href.lesson(next.ref.id)}>{next.ref.title} →</a> : <span />}
      </nav>
    </div>
  );
}

export function SandboxPage() {
  return (
    <div class="page">
      <nav class="crumbs"><a href={href.home()}>Главная</a> › Песочница</nav>
      <h1>JS-песочница</h1>
      <p class="lead">Свободный запуск JavaScript в изолированном Web Worker. Подходит для проверки порядка выполнения Promise, <code>queueMicrotask</code> и <code>setTimeout</code>.</p>
      <Sandbox />
    </div>
  );
}

export function SearchPage({ q }: { q: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void ensureIndex().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  const hits = ready ? search(q) : [];
  return (
    <div class="page">
      <nav class="crumbs"><a href={href.home()}>Главная</a> › Поиск</nav>
      <h1>Поиск</h1>
      {!ready ? (
        <p class="muted" aria-busy="true">Строю индекс…</p>
      ) : !q.trim() ? (
        <p class="muted">Введи слово или фразу в строке поиска сверху.</p>
      ) : hits.length === 0 ? (
        <p>По запросу «{q}» ничего не найдено. Поиск идёт по заголовкам всех уроков и по тексту готовых.</p>
      ) : (
        <>
          <p class="muted">Найдено: {hits.length}</p>
          <ul class="hits">
            {hits.map((h) => (
              <li key={h.lessonId}>
                <a href={href.lesson(h.lessonId)}><b>{h.title}</b></a>
                <small class="muted"> · {h.moduleTitle}</small>
                <p>{h.snippet}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export const practiceTools: Record<string, { title: string; widget: string; lead: string }> = {
  interview: { title: 'Мок-интервью', widget: 'mock-interview', lead: 'Отвечай письменно, затем сверяйся с эталоном и оценивай себя по ключевым пунктам. Результаты сохраняются, ответы можно выгрузить для разбора в чате с Claude.' },
  flashcards: { title: 'Карточки (метод Лейтнера)', widget: 'flashcards', lead: 'Короткие повторения по вопросам банка. Правильные ответы уходят в коробки с более длинными интервалами.' },
  star: { title: 'Истории STAR', widget: 'star-builder', lead: 'Подготовь 4 истории из реального опыта: оптимизация, инцидент, архитектура, конфликт.' },
  intro: { title: 'Рассказ о себе', widget: 'intro-builder', lead: 'Рассказ на 60–90 секунд и честный ответ на вопрос «почему Middle».' },
};

export function PracticePage({ tool }: { tool: string }) {
  const t = practiceTools[tool];
  if (!t) return <div class="page"><p>Инструмент не найден. <a href={href.home()}>На главную</a></p></div>;
  return (
    <div class="page">
      <nav class="crumbs"><a href={href.home()}>Главная</a> › Практика</nav>
      <h1>{t.title}</h1>
      <p class="lead">{t.lead}</p>
      <LazyWidget name={t.widget} />
    </div>
  );
}
