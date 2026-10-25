// One pass through a drill queue, as a reducer. `results[i]` is how drill i
// ended; it is written exactly once, when the drill is solved, shown or
// skipped. Actions that make no sense in the current phase return the same
// session, so a double click or a stale handler is harmless. A move the saved
// lines cannot judge is `checking` until a search of it comes back.

import type { Verdict } from './drill';

export type Phase = 'asking' | 'checking' | 'wrong' | 'solved' | 'shown';
export type Result = 'first-try' | 'retry' | 'shown' | 'skipped';
export type Session = {
  at: number;
  phase: Phase;
  tries: number;
  results: Result[];
};
export type Action =
  | { type: 'answer'; verdict: Verdict }
  | { type: 'check' }
  | { type: 'checked'; verdict: Verdict }
  | { type: 'show' }
  | { type: 'skip' }
  | { type: 'next' };

export const start = (): Session => ({
  at: 0,
  phase: 'asking',
  tries: 0,
  results: [],
});

/** Waiting for a move. */
const open = (phase: Phase) => phase === 'asking' || phase === 'wrong';
/** Not yet solved, shown or skipped. */
const unsettled = (phase: Phase) => open(phase) || phase === 'checking';

function judged(session: Session, verdict: Verdict): Session {
  const { tries, results } = session;
  return verdict === 'best' || verdict === 'close'
    ? {
        ...session,
        phase: 'solved',
        results: [...results, tries === 0 ? 'first-try' : 'retry'],
      }
    : { ...session, phase: 'wrong', tries: tries + 1 };
}

export function step(session: Session, action: Action, total: number): Session {
  if (session.at >= total) return session;
  const { phase, results } = session;
  switch (action.type) {
    case 'answer':
      return open(phase) ? judged(session, action.verdict) : session;
    case 'check':
      return open(phase) ? { ...session, phase: 'checking' } : session;
    case 'checked':
      return phase === 'checking' ? judged(session, action.verdict) : session;
    case 'show':
      if (!unsettled(phase)) return session;
      return { ...session, phase: 'shown', results: [...results, 'shown'] };
    case 'skip':
      if (!unsettled(phase)) return session;
      return {
        at: session.at + 1,
        phase: 'asking',
        tries: 0,
        results: [...results, 'skipped'],
      };
    case 'next':
      if (unsettled(phase)) return session;
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
