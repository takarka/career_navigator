/**
 * Сравнение подходов к идемпотентности на потоке сообщений с дублями и перестановкой.
 * Сообщение: { id, delta, value } — «увеличить баланс на delta» либо «установить баланс в value» (value — состояние после операции).
 */
export interface StreamMsg {
  id: string;
  delta: number;
  /** Состояние баланса после этой операции (для подхода «установить значение»). */
  value: number;
}

export type Approach = 'naive' | 'set-value' | 'dedup-table' | 'dedup-not-atomic';

export interface ApplyResult {
  balance: number;
  applied: string[];
  skipped: string[];
}

/**
 * naive             — увеличивает баланс на каждое полученное сообщение (дубль даёт двойной эффект);
 * set-value         — устанавливает значение из сообщения (естественная идемпотентность, но старый дубль может «откатить» состояние);
 * dedup-table       — записывает message_id в таблицу с UNIQUE в одной транзакции с эффектом (дубль отсекается);
 * dedup-not-atomic  — запись в таблицу и эффект в разных транзакциях: при сбое между ними эффект теряется или удваивается.
 */
export function applyStream(approach: Approach, stream: StreamMsg[], crashAfterDedupInsert?: string): ApplyResult {
  let balance = 0;
  const seen = new Set<string>();
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const m of stream) {
    if (approach === 'naive') {
      balance += m.delta;
      applied.push(m.id);
    } else if (approach === 'set-value') {
      balance = m.value;
      applied.push(m.id);
    } else if (approach === 'dedup-table') {
      if (seen.has(m.id)) skipped.push(m.id);
      else {
        seen.add(m.id);
        balance += m.delta;
        applied.push(m.id);
      }
    } else {
      // dedup-not-atomic: сначала запись в таблицу, затем эффект отдельной транзакцией
      if (seen.has(m.id)) {
        skipped.push(m.id);
        continue;
      }
      seen.add(m.id);
      if (crashAfterDedupInsert === m.id) {
        skipped.push(`${m.id} (сбой после записи в таблицу: эффект потерян, повтор отсечён)`);
        continue;
      }
      balance += m.delta;
      applied.push(m.id);
    }
  }
  return { balance, applied, skipped };
}

/** Ожидаемый итог: сумма delta по уникальным id в порядке первого появления. */
export function expectedBalance(stream: StreamMsg[]): number {
  const seen = new Set<string>();
  let b = 0;
  for (const m of stream) if (!seen.has(m.id)) {
    seen.add(m.id);
    b += m.delta;
  }
  return b;
}

export const demoStream: StreamMsg[] = [
  { id: 'm1', delta: 10, value: 10 },
  { id: 'm2', delta: 5, value: 15 },
  { id: 'm1', delta: 10, value: 10 }, // дубль, пришедший позже m2
  { id: 'm3', delta: -3, value: 12 },
  { id: 'm2', delta: 5, value: 15 }, // ещё один дубль
];
