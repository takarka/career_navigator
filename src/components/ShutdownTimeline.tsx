import { useState } from 'preact/hooks';
import { gracefulShutdown, naiveShutdown } from '../content/m01/shutdown.ts';
import { Timeline } from './Timeline.tsx';

/** Два режима остановки сервиса на общем Timeline: без обработчика SIGTERM и с graceful shutdown. */
export function ShutdownTimeline() {
  const [graceful, setGraceful] = useState(true);
  const aborted = graceful ? 0 : 1;
  return (
    <div class="shutdown">
      <div class="seg" role="group" aria-label="Режим остановки">
        <button class={graceful ? '' : 'on'} aria-pressed={!graceful} onClick={() => setGraceful(false)}>Без обработчика</button>
        <button class={graceful ? 'on' : ''} aria-pressed={graceful} onClick={() => setGraceful(true)}>Graceful shutdown</button>
      </div>
      <Timeline key={graceful ? 'g' : 'n'} spec={graceful ? gracefulShutdown : naiveShutdown} id={graceful ? 'sd-g' : 'sd-n'} />
      <p>Оборванных запросов в этом сценарии: <b>{aborted}</b>.</p>
    </div>
  );
}
