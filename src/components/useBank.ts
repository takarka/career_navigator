import { useEffect, useState } from 'preact/hooks';
import { getBank } from '../content/bank.ts';
import type { Question } from '../engine/interview.ts';

/** Банк вопросов; null, пока грузится. */
export function useBank(): Question[] | null {
  const [bank, setBank] = useState<Question[] | null>(null);
  useEffect(() => {
    let alive = true;
    void getBank().then((b) => alive && setBank(b));
    return () => {
      alive = false;
    };
  }, []);
  return bank;
}
