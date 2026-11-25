import { useEffect, useState } from 'preact/hooks';

export type Route =
  | { name: 'home' }
  | { name: 'module'; id: string }
  | { name: 'lesson'; id: string }
  | { name: 'sandbox' }
  | { name: 'demo' }
  | { name: 'search'; q: string };

export function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'module' && parts[1]) return { name: 'module', id: parts[1] };
  if (parts[0] === 'lesson' && parts[1]) return { name: 'lesson', id: parts[1] };
  if (parts[0] === 'sandbox') return { name: 'sandbox' };
  if (parts[0] === 'demo') return { name: 'demo' };
  if (parts[0] === 'search') {
    let q = parts[1] ?? '';
    try {
      q = decodeURIComponent(q);
    } catch {
      /* оставляем как есть */
    }
    return { name: 'search', q };
  }
  return { name: 'home' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parse(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const href = {
  home: () => '#/',
  module: (id: string) => `#/module/${id}`,
  lesson: (id: string) => `#/lesson/${id}`,
  sandbox: () => '#/sandbox',
  demo: () => '#/demo',
  search: (q: string) => `#/search/${encodeURIComponent(q)}`,
};
