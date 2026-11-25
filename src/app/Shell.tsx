import { useState } from 'preact/hooks';
import { modules } from '../content/modules.ts';
import { lessons } from '../content/lessons.ts';
import { cycleTheme, useDark } from './theme.ts';
import { useProgress } from './state.ts';
import { href, useRoute } from './router.ts';
import { Home, LessonPage, ModulePage, SandboxPage, SearchPage } from './pages.tsx';
import { findLessonRef } from '../content/modules.ts';

export function Shell() {
  const route = useRoute();
  const progress = useProgress();
  useDark();
  const [open, setOpen] = useState(false);
  const activeModule = route.name === 'module' ? route.id : route.name === 'lesson' ? findLessonRef(route.id)?.module.id : undefined;
  const themeIcon = progress.theme === 'auto' ? '🌓' : progress.theme === 'dark' ? '🌙' : '☀️';

  return (
    <div class="shell">
      <header class="topbar">
        <button class="menu" onClick={() => setOpen(!open)} aria-label="Меню" aria-expanded={open}>☰</button>
        <a class="brand" href={href.home()}>Node.js Backend</a>
        <form class="search" role="search" onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget as HTMLFormElement).get('q') as string; location.hash = href.search(q.trim()); }}>
          <input type="search" name="q" placeholder="Поиск" aria-label="Поиск по учебнику" value={route.name === 'search' ? route.q : undefined} />
        </form>
        <span class="spacer" />
        <a class="toplink" href={href.sandbox()}>Песочница</a>
        <button onClick={cycleTheme} title={`Тема: ${progress.theme}`} aria-label="Переключить тему">{themeIcon}</button>
      </header>
      <div class="body">
        <aside class={`sidebar ${open ? 'open' : ''}`} onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setOpen(false); }}>
          <nav aria-label="Содержание">
            {modules.map((m) => (
              <details key={m.id} open={activeModule === m.id}>
                <summary>
                  <span class="sumtitle"><span class="num">{m.num}</span> {m.title}</span>
                </summary>
                <ul>
                  <li class={`overview ${route.name === 'module' && route.id === m.id ? 'current' : ''}`}><a href={href.module(m.id)}>Обзор модуля</a></li>
                  {m.lessons.map((l) => (
                    <li key={l.id} class={`${route.name === 'lesson' && route.id === l.id ? 'current' : ''} ${lessons[l.id] ? '' : 'soon'}`}>
                      <a href={href.lesson(l.id)}>
                        <span class="check">{progress.lessons[l.id] ? '✓' : lessons[l.id] ? '○' : '·'}</span> {l.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            <p class="side-extra"><a href={href.sandbox()}>JS-песочница</a></p>
          </nav>
        </aside>
        <main>
          {route.name === 'home' && <Home />}
          {route.name === 'module' && <ModulePage id={route.id} />}
          {route.name === 'lesson' && <LessonPage id={route.id} key={route.id} />}
          {route.name === 'sandbox' && <SandboxPage />}
          {route.name === 'search' && <SearchPage q={route.q} key={route.q} />}
        </main>
      </div>
    </div>
  );
}
