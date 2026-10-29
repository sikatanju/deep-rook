// When analysis should wait: the tab is hidden, or the device is running down
// its battery. One small store the provider feeds to every analyzer, so a
// review on screen and a batch on another page follow the same rules.

/** Below this charge, and not charging, analysis waits for the player's say. */
export const LOW_BATTERY = 0.2;

/** The slice of the Battery Status API this reads. Chromium only. */
export type Battery = {
  charging: boolean;
  /** 0 to 1. */
  level: number;
  addEventListener(
    type: 'chargingchange' | 'levelchange',
    fn: () => void,
  ): void;
  removeEventListener(
    type: 'chargingchange' | 'levelchange',
    fn: () => void,
  ): void;
};

/** `hidden` outranks `battery`: a note for a tab nobody can see helps no one. */
export type PauseReason = 'hidden' | 'battery' | null;

export type Pauser = {
  /** Why analysis is waiting; null when it may run. Stable between changes. */
  getSnapshot(): PauseReason;
  subscribe(listener: () => void): () => void;
  /** Runs despite the low battery, until the battery stops being low. */
  continueAnyway(): void;
};

type Options = {
  doc?: Pick<
    Document,
    'visibilityState' | 'addEventListener' | 'removeEventListener'
  >;
  /** Where the battery is read from. Defaults to the browser's; undefined where it has none. */
  getBattery?: () => Promise<Battery> | undefined;
};

const browserBattery = () =>
  (
    globalThis.navigator as
      (Navigator & { getBattery?: () => Promise<Battery> }) | undefined
  )?.getBattery?.();

export function createPauser({
  doc = document,
  getBattery = browserBattery,
}: Options = {}): Pauser {
  const listeners = new Set<() => void>();
  let battery: Battery | null = null;
  let asked = false;
  let override = false;
  let reason: PauseReason = null;

  function update() {
    const low = !!battery && !battery.charging && battery.level < LOW_BATTERY;
    if (!low) override = false;
    const next: PauseReason =
      doc.visibilityState === 'hidden'
        ? 'hidden'
        : low && !override
          ? 'battery'
          : null;
    if (next === reason) return;
    reason = next;
    listeners.forEach((l) => l());
  }

  function watch(source: Battery) {
    source.addEventListener('chargingchange', update);
    source.addEventListener('levelchange', update);
  }

  // Listening starts with the first subscriber and ends with the last, so a
  // pauser nobody reads holds no listeners and a remount just starts again.
  function connect() {
    doc.addEventListener('visibilitychange', update);
    if (battery) watch(battery);
    else if (!asked) {
      asked = true;
      // A browser may lack the API or refuse; analysis then runs as it always did.
      Promise.resolve(getBattery?.())
        .then((found) => {
          if (!found) return;
          battery = found;
          if (listeners.size) watch(found);
          update();
        })
        .catch(() => {});
    }
    update();
  }

  function disconnect() {
    doc.removeEventListener('visibilitychange', update);
    battery?.removeEventListener('chargingchange', update);
    battery?.removeEventListener('levelchange', update);
  }

  return {
    getSnapshot: () => reason,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) connect();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) disconnect();
      };
    },
    continueAnyway() {
      override = true;
      update();
    },
  };
}
