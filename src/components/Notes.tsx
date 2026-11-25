import { setNote, useProgress } from '../app/state.ts';

export function Notes({ lessonId }: { lessonId: string }) {
  const progress = useProgress();
  return (
    <section class="notes">
      <h2>Мои заметки</h2>
      <label class="muted" for={`note-${lessonId}`}>Сохраняются в этом браузере и попадают в экспорт прогресса.</label>
      <textarea
        id={`note-${lessonId}`}
        rows={5}
        value={progress.notes[lessonId] ?? ''}
        placeholder="Что стоит запомнить, что осталось непонятным…"
        onInput={(e) => setNote(lessonId, (e.target as HTMLTextAreaElement).value)}
      />
    </section>
  );
}
