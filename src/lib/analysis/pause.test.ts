import { expect, test, vi } from 'vitest';

import { createPauser, LOW_BATTERY, type Battery } from './pause';

function page(state: 'visible' | 'hidden' = 'visible') {
  const doc = Object.assign(new EventTarget(), { visibilityState: state });
  return {
    doc,
    show: (next: 'visible' | 'hidden') => {
      doc.visibilityState = next;
      doc.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

function battery(charging: boolean, level: number) {
  const target = new EventTarget();
  const state = { charging, level };
  const fake = Object.assign(target, state) as unknown as Battery &
    typeof state;
  return {
    fake,
    set: (patch: Partial<typeof state>, event: string) => {
      Object.assign(fake, patch);
      target.dispatchEvent(new Event(event));
    },
  };
}

/** A pauser with a reader, which is when it starts listening. */
function watched(options: Parameters<typeof createPauser>[0]) {
  const pauser = createPauser(options);
  const unsubscribe = pauser.subscribe(() => {});
  return Object.assign(pauser, { unsubscribe });
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

test('a hidden tab pauses and a shown one resumes', () => {
  const { doc, show } = page();
  const pauser = watched({ doc, getBattery: () => undefined });
  const seen = vi.fn();
  pauser.subscribe(seen);
  expect(pauser.getSnapshot()).toBeNull();

  show('hidden');
  expect(pauser.getSnapshot()).toBe('hidden');
  show('visible');
  expect(pauser.getSnapshot()).toBeNull();
  expect(seen).toHaveBeenCalledTimes(2);
});

test('a tab that opens hidden starts paused', () => {
  const { doc } = page('hidden');
  expect(watched({ doc, getBattery: () => undefined }).getSnapshot()).toBe(
    'hidden',
  );
});

test('a discharging battery below the threshold pauses; charging or recovering resumes', async () => {
  const { doc } = page();
  const { fake, set } = battery(false, LOW_BATTERY + 0.05);
  const pauser = watched({ doc, getBattery: () => Promise.resolve(fake) });
  await settle();
  expect(pauser.getSnapshot()).toBeNull();

  set({ level: LOW_BATTERY - 0.01 }, 'levelchange');
  expect(pauser.getSnapshot()).toBe('battery');
  set({ charging: true }, 'chargingchange');
  expect(pauser.getSnapshot()).toBeNull();
});

test('a low battery that is charging never pauses', async () => {
  const { doc } = page();
  const { fake } = battery(true, 0.05);
  const pauser = watched({ doc, getBattery: () => Promise.resolve(fake) });
  await settle();
  expect(pauser.getSnapshot()).toBeNull();
});

test('"continue anyway" holds until the battery stops being low, then asks again next time', async () => {
  const { doc } = page();
  const { fake, set } = battery(false, 0.1);
  const pauser = watched({ doc, getBattery: () => Promise.resolve(fake) });
  await settle();
  expect(pauser.getSnapshot()).toBe('battery');

  pauser.continueAnyway();
  expect(pauser.getSnapshot()).toBeNull();
  set({ level: 0.05 }, 'levelchange');
  expect(pauser.getSnapshot()).toBeNull();

  set({ charging: true }, 'chargingchange');
  set({ charging: false }, 'chargingchange');
  expect(pauser.getSnapshot()).toBe('battery');
});

test('a hidden tab stays paused after "continue anyway", and a low battery is not a reason once shown', async () => {
  const { doc, show } = page();
  const { fake } = battery(false, 0.1);
  const pauser = watched({ doc, getBattery: () => Promise.resolve(fake) });
  await settle();
  pauser.continueAnyway();
  show('hidden');
  expect(pauser.getSnapshot()).toBe('hidden');
  show('visible');
  expect(pauser.getSnapshot()).toBeNull();
});

test('without a battery API, or when it refuses, only the tab decides', async () => {
  const { doc, show } = page();
  const pauser = watched({
    doc,
    getBattery: () => Promise.reject(new Error('blocked')),
  });
  await settle();
  expect(pauser.getSnapshot()).toBeNull();
  show('hidden');
  expect(pauser.getSnapshot()).toBe('hidden');
});

test('after its last reader leaves it stops listening, and a new one starts it again', () => {
  const { doc, show } = page();
  const pauser = watched({ doc, getBattery: () => undefined });
  pauser.unsubscribe();
  show('hidden');
  expect(pauser.getSnapshot()).toBeNull();

  const seen = vi.fn();
  pauser.subscribe(seen);
  expect(pauser.getSnapshot()).toBe('hidden');
  expect(seen).toHaveBeenCalled();
});
