import type { Block } from '../content/types.ts';
import { Markdown } from './Markdown.tsx';
import { Quiz } from './Quiz.tsx';
import { TaskCard } from './TaskCard.tsx';
import { widgets } from './widgets.tsx';

const calloutIcon = { info: 'ℹ️', warn: '⚠️', tip: '💡' } as const;

export function BlockView({ block }: { block: Block }) {
  switch (block.t) {
    case 'md':
      return <Markdown text={block.text} />;
    case 'callout':
      return (
        <div class={`callout ${block.kind}`}>
          <div class="callout-title">{calloutIcon[block.kind]} {block.title}</div>
          <Markdown text={block.text} />
        </div>
      );
    case 'interview':
      return (
        <details class="interview">
          <summary><span class="tag">Как спросят</span> {block.q}</summary>
          <div class="answer"><span class="tag ok">Как ответить</span><Markdown text={block.a} /></div>
        </details>
      );
    case 'widget': {
      const W = widgets[block.name];
      return (
        <figure class="widget">
          {block.model && <span class="badge model">модель</span>}
          {W ? <W {...(block.props ?? {})} /> : <p>Виджет «{block.name}» не найден.</p>}
          {block.caption && <figcaption>{block.caption}</figcaption>}
        </figure>
      );
    }
    case 'quiz':
      return <Quiz id={block.id} title={block.title} questions={block.questions} />;
    case 'task':
      return <TaskCard task={block.task} />;
  }
}
