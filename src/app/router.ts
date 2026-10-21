import { useSyncExternalStore } from 'react';

export const ROUTES = [
  'games',
  'overview',
  'drill',
  'review',
  'settings',
] as const;
export type Route = (typeof ROUTES)[number];

function read(): Route {
  const name = location.hash.replace(/^#\/?/, '');
  return ROUTES.find((r) => r === name) ?? 'games';
}

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
