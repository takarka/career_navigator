/**
 * Модель backpressure для Writable-потока в objectMode с медленным приёмником.
 * Время идёт «витками» цикла событий. На каждом витке (кроме первого) сначала приёмник завершает одну запись
 * (setImmediate-колбэк _write), затем выполняется производитель, запланированный на этот виток.
 * Производитель за один виток пишет до perTick элементов. write() «возвращает false», когда в буфере
 * элементов не меньше highWaterMark. При respect = true производитель после false ждёт события drain,
 * которое приходит, когда буфер опустел (и не приходит, если поток уже закрывается).
 * Модель сверяется с реальным Node автотестом (labs/m01/streams/backpressure.cjs).
 */
export interface BpInput {
  total: number;
  perTick: number;
  highWaterMark: number;
  respect: boolean;
}

export interface BpFrame {
  iteration: number;
  buffered: number;
  written: number;
  processed: number;
  note: string;
}

export interface BpResult {
  maxBuffered: number;
  processed: number;
  drains: number;
  iterations: number;
  frames: BpFrame[];
}

export function simulateBackpressure(i: BpInput): BpResult {
  let L = 0;
  let written = 0;
  let processed = 0;
  let drains = 0;
  let maxBuffered = 0;
  let inflight = false;
  let needDrain = false;
  let ending = false;
  let waiting = false;
  let producerScheduled = false;
  const frames: BpFrame[] = [];
  let it = 0;
  let note = '';

  const produce = () => {
    for (let n = 0; n < i.perTick && written < i.total; n++) {
      written++;
      L++;
      if (!inflight) inflight = true; // первая запись сразу уходит в _write
      maxBuffered = Math.max(maxBuffered, L);
      const ok = L < i.highWaterMark;
      if (!ok) needDrain = true;
      if (!ok && i.respect) {
        waiting = true;
        note += ' Производитель получил false и ждёт drain.';
        return;
      }
    }
    if (written < i.total) producerScheduled = true;
    else ending = true;
  };

  while (it < 100000) {
    it++;
    note = '';
    if (it === 1) produce();
    else {
      const runProducer = producerScheduled; // запланированный на прошлом витке производитель
      producerScheduled = false;
      if (inflight) {
        processed++;
        L--;
        inflight = L > 0;
        if (L === 0 && needDrain) {
          needDrain = false;
          if (!ending) {
            drains++;
            note += ' Буфер опустел: drain.';
            if (waiting) {
              waiting = false;
              produce();
            }
          }
        }
      }
      if (runProducer) produce();
    }
    frames.push({ iteration: it, buffered: L, written, processed, note: note.trim() });
    if (processed >= i.total) break;
  }
  return { maxBuffered, processed, drains, iterations: it, frames };
}
