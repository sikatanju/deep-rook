import { expect, test } from 'vitest';

import { parseHash } from './router';

test('the route is the name before any query', () => {
  const { route, params } = parseHash('#/review?v=1&g=abc-_&side=b');
  expect(route).toBe('review');
  expect(params.get('v')).toBe('1');
  expect(params.get('g')).toBe('abc-_');
  expect(params.get('side')).toBe('b');
});

test('plain routes have no params', () => {
  expect(parseHash('#/overview').route).toBe('overview');
  expect([...parseHash('#/overview').params]).toEqual([]);
});

test('an empty, root, or unknown hash is the games page', () => {
  expect(parseHash('').route).toBe('games');
  expect(parseHash('#').route).toBe('games');
  expect(parseHash('#/').route).toBe('games');
  expect(parseHash('#/nope').route).toBe('games');
  expect(parseHash('#/nope?g=abc').route).toBe('games');
});

test('a trailing slash still names the route', () => {
  expect(parseHash('#/review/').route).toBe('review');
  expect(parseHash('#/review/?g=x').params.get('g')).toBe('x');
});
