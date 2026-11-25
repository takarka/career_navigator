import type { Block } from './types.ts';

/** Плоский текст блока: для поиска и для линтера. */
export function blockText(b: Block): string {
  switch (b.t) {
    case 'md':
      return b.text;
    case 'callout':
      return `${b.title ?? ''}\n${b.text}`;
    case 'interview':
      return `${b.q}\n${b.a}`;
    case 'quiz':
      return b.questions.map((q) => `${q.q}\n${q.options.join('\n')}\n${q.explain}`).join('\n');
    case 'task': {
      const t = b.task;
      return [t.title, t.summary, ...(t.steps ?? []), ...(t.hints ?? []), ...(t.check ?? []), t.expected ?? '', ...(t.commands ?? []).map((c) => `${c.cmd} ${c.note ?? ''}`)].join('\n');
    }
    case 'widget':
      return b.caption ?? '';
  }
}

/** Заголовки второго уровня из markdown-блоков урока. */
export function headingsOf(blocks: Block[]): string[] {
  const out: string[] = [];
  for (const b of blocks) if (b.t === 'md') for (const m of b.text.matchAll(/^##\s+(.+)$/gm)) out.push(m[1].trim());
  return out;
}
