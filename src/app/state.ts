import { useEffect, useState } from 'preact/hooks';

import { emptyProgress, migrate, type Progress } from './migrate.ts';

export type { Progress };

const KEY = 'nodejs-textbook:v1';

let memory: string | null = null;
function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return memory;
  }
}
function write(v: string) {
  memory = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* хранилище недоступно — остаёмся в памяти */
  }
}

function load(): Progress {
  const raw = read();
  if (!raw) return emptyProgress();
  try {
    return migrate(JSON.parse(raw));
  } catch {
    return emptyProgress();
  }
}

let state: Progress = load();
const subs = new Set<() => void>();

export function getState() {
  return state;
}

export function update(fn: (p: Progress) => void) {
  const next: Progress = JSON.parse(JSON.stringify(state));
  fn(next);
  state = next;
  write(JSON.stringify(state));
  subs.forEach((f) => f());
}

export function useProgress(): Progress {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((x) => x + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return state;
}

export function exportProgress(): string {
  return JSON.stringify(state, null, 2);
}

export function importProgress(json: string): boolean {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false;
    const next = migrate(parsed);
    update((p) => Object.assign(p, next));
    return true;
  } catch {
    return false;
  }
}

export function toggle(map: 'lessons' | 'tasks' | 'predict', id: string, value?: boolean) {
  update((p) => {
    const on = value ?? !p[map][id];
    if (on) p[map][id] = true;
    else delete p[map][id];
  });
}

export function setNote(lessonId: string, text: string) {
  update((p) => {
    if (text.trim()) p.notes[lessonId] = text;
    else delete p.notes[lessonId];
  });
}

export function setDetail(on: boolean) {
  update((p) => {
    p.detail = on;
  });
}
