import { useEffect, useState } from 'preact/hooks';

export interface Progress {
  lessons: Record<string, true>;
  tasks: Record<string, true>;
  predict: Record<string, true>;
  quizzes: Record<string, { score: number; total: number }>;
  notes: Record<string, string>;
  theme: 'auto' | 'light' | 'dark';
}

const KEY = 'nodejs-textbook:v1';
const empty = (): Progress => ({ lessons: {}, tasks: {}, predict: {}, quizzes: {}, notes: {}, theme: 'auto' });

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
  if (!raw) return empty();
  try {
    return { ...empty(), ...JSON.parse(raw) };
  } catch {
    return empty();
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
    if (typeof parsed !== 'object' || parsed === null) return false;
    update((p) => Object.assign(p, empty(), parsed));
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
