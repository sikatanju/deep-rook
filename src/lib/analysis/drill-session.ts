// One pass through a drill queue, as a reducer. `results[i]` is how drill i
// ended; it is written exactly once, when the drill is solved, shown or
// skipped. Actions that make no sense in the current phase return the same
// session, so a double click or a stale handler is harmless.

import type { Verdict } from './drill';

export type Phase = 'asking' | 'wrong' | 'solved' | 'shown';
export type Result = 'first-try' | 'retry' | 'shown' | 'skipped';
export type Session = {
  at: number;
  phase: Phase;
  tries: number;
  results: Result[];
};
export type Action =
  | { type: 'answer'; verdict: Verdict }
  | { type: 'show' }
  | { type: 'skip' }
  | { type: 'next' };

export const start = (): Session => ({
  at: 0,
  phase: 'asking',
  tries: 0,
  results: [],
});

const open = (phase: Phase) => phase === 'asking' || phase === 'wrong';

export function step(session: Session, action: Action, total: number): Session {
  if (session.at >= total) return session;
  const { phase, tries, results } = session;
  switch (action.type) {
    case 'answer':
      if (!open(phase)) return session;
      return action.verdict === 'best'
        ? {
            ...session,
            phase: 'solved',
            results: [...results, tries === 0 ? 'first-try' : 'retry'],
          }
        : { ...session, phase: 'wrong', tries: tries + 1 };
    case 'show':
      if (!open(phase)) return session;
      return { ...session, phase: 'shown', results: [...results, 'shown'] };
    case 'skip':
      if (!open(phase)) return session;
      return {
        at: session.at + 1,
        phase: 'asking',
        tries: 0,
        results: [...results, 'skipped'],
      };
    case 'next':
      if (open(phase)) return session;
      return { ...session, at: session.at + 1, phase: 'asking', tries: 0 };
  }
}

export const finished = (session: Session, total: number) =>
  session.at >= total;

export function summary(session: Session): Record<Result, number> {
  const counts: Record<Result, number> = {
    'first-try': 0,
    retry: 0,
    shown: 0,
    skipped: 0,
  };
  for (const result of session.results) counts[result]++;
  return counts;
}
