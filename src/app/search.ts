import { flatLessons } from '../content/modules.ts';
import { lessons } from '../content/lessons.ts';
import { blockText } from '../content/text.ts';

export interface Hit {
  lessonId: string;
  title: string;
  moduleTitle: string;
  snippet: string;
  score: number;
}

interface Doc {
  lessonId: string;
  title: string;
  moduleTitle: string;
  text: string;
}

let index: Doc[] | null = null;

function build(): Doc[] {
  return flatLessons().map(({ module: m, ref }) => ({
    lessonId: ref.id,
    title: ref.title,
    moduleTitle: m.title,
    text: lessons[ref.id] ? lessons[ref.id].blocks.map(blockText).join('\n') : (ref.summary ?? ''),
  }));
}

const clean = (s: string) => s.replace(/[`*_>#|]/g, '').replace(/\s+/g, ' ');

export function search(query: string): Hit[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  index ??= build();
  const hits: Hit[] = [];
  for (const d of index) {
    const title = d.title.toLowerCase();
    const text = clean(d.text);
    const low = text.toLowerCase();
    let score = 0;
    let first = -1;
    let ok = true;
    for (const w of words) {
      const inTitle = title.includes(w);
      const at = low.indexOf(w);
      if (!inTitle && at < 0) {
        ok = false;
        break;
      }
      if (inTitle) score += 10;
      if (at >= 0) {
        score += 1 + Math.min(5, low.split(w).length - 1);
        if (first < 0 || at < first) first = at;
      }
    }
    if (!ok) continue;
    const from = Math.max(0, first - 60);
    const snippet = first >= 0 ? (from > 0 ? '…' : '') + text.slice(from, first + 140) + '…' : text.slice(0, 140);
    hits.push({ lessonId: d.lessonId, title: d.title, moduleTitle: d.moduleTitle, snippet, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 30);
}
