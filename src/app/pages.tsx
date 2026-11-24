import { useRef } from 'preact/hooks';
import { findLessonRef, flatLessons, modules, priorityLabel } from '../content/modules.ts';
import { lessons } from '../content/lessons.ts';
import { BlockView } from '../components/Blocks.tsx';
import { Sandbox } from '../components/Sandbox.tsx';
import { modeInfo } from '../components/TaskCard.tsx';
import { exportProgress, importProgress, toggle, useProgress } from './state.ts';
import { href } from './router.ts';

function moduleStats(id: string, progress: ReturnType<typeof useProgress>) {
  const m = modules.find((x) => x.id === id)!;
  const ready = m.lessons.filter((l) => lessons[l.id]);
  const done = m.lessons.filter((l) => progress.lessons[l.id]);
  return { total: m.lessons.length, ready: ready.length, done: done.length };
}

export function Home() {
  const progress = useProgress();
  const file = useRef<HTMLInputElement>(null);
  const all = flatLessons();
  const readyCount = all.filter((x) => lessons[x.ref.id]).length;
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
          const ready = !!lessons[l.id];
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
    </div>
  );
}

export function LessonPage({ id }: { id: string }) {
  const progress = useProgress();
  const found = findLessonRef(id);
  if (!found) return <div class="page"><p>Урок не найден. <a href={href.home()}>На главную</a></p></div>;
  const { module: m, ref } = found;
  const lesson = lessons[id];
  const all = flatLessons();
  const pos = all.findIndex((x) => x.ref.id === id);
  const prev = all[pos - 1];
  const next = all[pos + 1];

  return (
    <div class="page lesson">
      <nav class="crumbs"><a href={href.home()}>Главная</a> › <a href={href.module(m.id)}>Модуль {m.num}. {m.title}</a></nav>
      <h1>{ref.title}</h1>
      {!lesson && (
        <div class="callout info">
          <div class="callout-title">🚧 Урок ещё в разработке</div>
          <p>Содержание появится по плану реализации. Сейчас готов урок про event loop в модуле 1 — он задаёт формат для остальных.</p>
        </div>
      )}
      {lesson?.blocks.map((b, i) => <BlockView key={i} block={b} />)}
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
