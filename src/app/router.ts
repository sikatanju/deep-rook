import { useSyncExternalStore } from 'react';

export const ROUTES = [
  'games',
  'overview',
  'drill',
  'review',
  'settings',
] as const;
export type Route = (typeof ROUTES)[number];

/** `#/review?v=1&g=...` is the review route carrying a query. Unknown routes are the games page. */
export function parseHash(hash: string): {
  route: Route;
  params: URLSearchParams;
} {
  const rest = hash.replace(/^#\/?/, '');
  const at = rest.indexOf('?');
  const name = (at < 0 ? rest : rest.slice(0, at)).replace(/\/$/, '');
  return {
    route: ROUTES.find((r) => r === name) ?? 'games',
    params: new URLSearchParams(at < 0 ? '' : rest.slice(at + 1)),
  };
}

const read = (): Route => parseHash(location.hash).route;

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, read, () => 'games');
}

export function navigate(route: Route) {
  location.hash = `/${route}`;
}
