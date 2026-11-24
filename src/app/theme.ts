import { useEffect, useState } from 'preact/hooks';
import { useProgress, update } from './state.ts';

const mq = () => window.matchMedia('(prefers-color-scheme: dark)');

export function useDark(): boolean {
  const { theme } = useProgress();
  const [sys, setSys] = useState(() => mq().matches);
  useEffect(() => {
    const m = mq();
    const f = () => setSys(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  const dark = theme === 'dark' || (theme === 'auto' && sys);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);
  return dark;
}

export function cycleTheme() {
  update((p) => {
    p.theme = p.theme === 'auto' ? 'dark' : p.theme === 'dark' ? 'light' : 'auto';
  });
}
