/**
 * Кэш слоёв Docker: слой пересобирается, если изменилась его инструкция или файлы, которые она копирует,
 * либо пересобран любой предыдущий слой. Упрощённая модель правил BuildKit.
 */
export interface Step {
  cmd: string;
  /** Файлы/каталоги, от содержимого которых зависит шаг (для COPY); для RUN пусто. */
  inputs?: string[];
}

export function rebuilt(steps: Step[], changed: string[]): boolean[] {
  let dirty = false;
  return steps.map((s) => {
    if (!dirty && (s.inputs ?? []).some((i) => changed.some((c) => c === i || c.startsWith(i.endsWith('/') ? i : i + '/') || i === '.'))) dirty = true;
    return dirty;
  });
}

export const badOrder: Step[] = [
  { cmd: 'FROM node:22-slim' },
  { cmd: 'WORKDIR /app' },
  { cmd: 'COPY . .', inputs: ['.'] },
  { cmd: 'RUN npm ci', inputs: [] },
  { cmd: 'RUN npm run build' },
];

export const goodOrder: Step[] = [
  { cmd: 'FROM node:22-slim' },
  { cmd: 'WORKDIR /app' },
  { cmd: 'COPY package.json package-lock.json ./', inputs: ['package.json', 'package-lock.json'] },
  { cmd: 'RUN npm ci' },
  { cmd: 'COPY src ./src', inputs: ['src'] },
  { cmd: 'RUN npm run build' },
];
