import { useEffect, useState } from 'preact/hooks';

interface Item {
  id: string;
  text: string;
}

/** Оглавление урока: собирается из заголовков h2 уже отрисованной страницы. */
export function Toc({ lessonId }: { lessonId: string }) {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const collect = () => {
      const hs = Array.from(document.querySelectorAll<HTMLElement>('.lesson .md h2'));
      const next = hs.map((h, i) => {
        if (!h.id) h.id = `sec-${lessonId}-${i}`;
        return { id: h.id, text: h.textContent ?? '' };
      });
      setItems((prev) => (prev.length === next.length && prev.every((p, i) => p.id === next[i].id && p.text === next[i].text) ? prev : next));
    };
    collect();
    const root = document.querySelector('.lesson');
    if (!root) return;
    const mo = new MutationObserver(collect);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [lessonId]);

  if (items.length < 2) return null;
  return (
    <nav class="toc" aria-label="Оглавление урока">
      <details>
        <summary>Оглавление урока</summary>
        <ol>
          {items.map((it) => (
            <li key={it.id}>
              <button
                class="linklike"
                onClick={() => {
                  const el = document.getElementById(it.id);
                  el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
                  el?.setAttribute('tabindex', '-1');
                  el?.focus({ preventScroll: true });
                }}
              >
                {it.text}
              </button>
            </li>
          ))}
        </ol>
      </details>
    </nav>
  );
}
