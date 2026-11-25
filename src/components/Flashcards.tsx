import { useMemo, useState } from 'preact/hooks';
import { useBank } from './useBank.ts';
import { modules } from '../content/modules.ts';
import { boxCounts, dueCards, isoDay, review } from '../engine/leitner.ts';
import { setCard, useProgress } from '../app/state.ts';
import { Markdown } from './Markdown.tsx';

/** Карточки по методу Лейтнера: лицо — вопрос, оборот — ключевые пункты. Колоды по модулям. */
export function Flashcards() {
  const progress = useProgress();
  const loaded = useBank();
  const bank = useMemo(() => loaded ?? [], [loaded]);
  const decks = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const q of bank) m.set(q.module, [...(m.get(q.module) ?? []), q.id]);
    return m;
  }, [bank]);
  const [deck, setDeck] = useState<string>('all');
  const [quick, setQuick] = useState(false);
  const [shown, setShown] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const today = isoDay(new Date());

  const ids = deck === 'all' ? bank.map((q) => q.id) : (decks.get(deck) ?? []);
  const queue = useMemo(() => {
    const due = dueCards(ids, progress.flashcards, today, quick ? 0 : 10);
    return quick ? due.slice(0, 15) : due;
  }, [ids.join(','), progress.flashcards, today, quick]).filter((id) => !skipped.includes(id));
  const currentId = queue[0];
  const card = bank.find((q) => q.id === currentId);
  const counts = boxCounts(ids, progress.flashcards);

  const answer = (correct: boolean) => {
    if (!card) return;
    setCard(card.id, review(progress.flashcards[card.id], correct, today));
    setShown(false);
  };

  if (!loaded) return <p class="muted" aria-busy="true">Загружаю банк вопросов…</p>;

  return (
    <div class="flash">
      <div class="row wrap">
        <label>Колода{' '}
          <select value={deck} onChange={(e) => { setDeck((e.target as HTMLSelectElement).value); setSkipped([]); setShown(false); }}>
            <option value="all">Все ({bank.length})</option>
            {modules.filter((m) => decks.has(`m${String(m.num).padStart(2, '0')}`)).map((m) => {
              const id = `m${String(m.num).padStart(2, '0')}`;
              return <option key={id} value={id}>{m.num}. {m.title} ({decks.get(id)!.length})</option>;
            })}
          </select>
        </label>
        <label><input type="checkbox" checked={quick} onChange={() => setQuick(!quick)} /> Быстрый повтор перед собеседованием (только просроченные)</label>
      </div>
      <p class="muted" aria-label="Карточек по коробкам">Коробки 1–5: {counts.join(' · ')}. К повторению сейчас: {queue.length}.</p>
      {!card ? (
        <div class="callout tip"><div class="callout-title">На сегодня всё</div><p>Карточек к повторению нет. Загляни завтра или смени колоду.</p></div>
      ) : (
        <div class="card-face">
          <p class="muted">{card.module} · {card.kind}</p>
          <h3>{card.question}</h3>
          {!shown ? (
            <div class="row">
              <button class="primary" onClick={() => setShown(true)}>Показать ключевые пункты</button>
              <button onClick={() => { setSkipped([...skipped, card.id]); setShown(false); }}>Пропустить</button>
            </div>
          ) : (
            <>
              <ul>{card.keyPoints.map((k) => <li key={k}><Markdown text={k} inline /></li>)}</ul>
              <p class="muted">Ты назвал(а) большинство пунктов?</p>
              <div class="row">
                <button class="primary" onClick={() => answer(true)}>Знаю</button>
                <button onClick={() => answer(false)}>Не знаю</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
