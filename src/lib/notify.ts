// System notifications, as a nicety: every failure here is swallowed, because
// a review that finished must never be spoiled by a browser that will not say so.

export type Permission = NotificationPermission | 'unsupported';

export type Alert = {
  title: string;
  body: string;
  /** The page a click opens, such as `#/overview`. */
  hash: string;
};

export const permission = (): Permission =>
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;

/** Asks the browser. Call it from a click; a prompt on load is what people block. */
export async function askPermission(): Promise<Permission> {
  if (permission() === 'unsupported') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return permission();
  }
}

/**
 * Shows the alert if the player allowed it. The installed app needs the
 * service worker to show it (Android refuses the constructor there), and its
 * click handler lives in sw.js. A plain tab falls back to the constructor.
 */
export async function notify({ title, body, hash }: Alert): Promise<void> {
  if (permission() !== 'granted') return;
  const options = { body, tag: 'batch-done', icon: '/apple-touch-icon.png' };
  const registration = await navigator.serviceWorker
    ?.getRegistration()
    .catch(() => undefined);
  if (registration) {
    try {
      await registration.showNotification(title, {
        ...options,
        data: { hash },
      });
      return;
    } catch {
      // A worker still installing cannot show it; the constructor may.
    }
  }
  try {
    const shown = new Notification(title, options);
    shown.onclick = () => {
      window.focus();
      location.hash = hash;
      shown.close();
    };
  } catch {
    // Unsupported here, such as the constructor on Android.
  }
}

/** The service worker asks the page to go where a clicked notification points. */
export function followNotificationClicks(): () => void {
  const container = navigator.serviceWorker;
  if (!container) return () => {};
  const onMessage = (event: MessageEvent) => {
    const { type, hash } = event.data ?? {};
    if (type === 'open' && typeof hash === 'string' && hash.startsWith('#/'))
      location.hash = hash;
  };
  container.addEventListener('message', onMessage);
  return () => container.removeEventListener('message', onMessage);
}
