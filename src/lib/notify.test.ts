import { afterEach, expect, test, vi } from 'vitest';

import {
  askPermission,
  followNotificationClicks,
  notify,
  permission,
} from './notify';

const alert = { title: 'Ready', body: '3 games', hash: '#/overview' };

function stubNotification(initial: NotificationPermission) {
  const made: {
    title: string;
    options: unknown;
    close: () => void;
    onclick?: () => void;
  }[] = [];
  class Fake {
    static permission = initial;
    static requestPermission = vi.fn(async () => 'granted' as const);
    close = vi.fn();
    onclick?: () => void;
    constructor(
      public title: string,
      public options: unknown,
    ) {
      made.push(this);
    }
  }
  vi.stubGlobal('Notification', Fake);
  return { Fake, made };
}

function stubWorker(registration: unknown) {
  const container = Object.assign(new EventTarget(), {
    getRegistration: vi.fn(async () => registration),
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: container,
  });
  return container;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
  location.hash = '';
});

test('without the Notification API nothing is asked and nothing is shown', async () => {
  vi.stubGlobal('Notification', undefined);
  expect(permission()).toBe('unsupported');
  expect(await askPermission()).toBe('unsupported');
  await expect(notify(alert)).resolves.toBeUndefined();
});

test('permission is only asked for by askPermission', async () => {
  const { Fake } = stubNotification('default');
  expect(permission()).toBe('default');
  expect(Fake.requestPermission).not.toHaveBeenCalled();
  expect(await askPermission()).toBe('granted');
  expect(Fake.requestPermission).toHaveBeenCalledTimes(1);
});

test('a refused request reads as the current permission', async () => {
  const { Fake } = stubNotification('default');
  Fake.requestPermission.mockRejectedValueOnce(new Error('no'));
  expect(await askPermission()).toBe('default');
});

test.each(['default', 'denied'] as const)(
  'nothing is shown while permission is %s',
  async (state) => {
    const { made } = stubNotification(state);
    await notify(alert);
    expect(made).toHaveLength(0);
  },
);

test('a plain tab shows it with the constructor, and a click goes to the page', async () => {
  const { made } = stubNotification('granted');
  const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
  await notify(alert);
  expect(made).toHaveLength(1);
  expect(made[0]).toMatchObject({
    title: 'Ready',
    options: { body: '3 games' },
  });

  made[0]!.onclick!();
  expect(focus).toHaveBeenCalled();
  expect(location.hash).toBe('#/overview');
  expect(made[0]!.close).toHaveBeenCalled();
});

test('the installed app shows it through the service worker, with the page to open', async () => {
  const { made } = stubNotification('granted');
  const showNotification = vi.fn(async () => {});
  stubWorker({ showNotification });
  await notify(alert);
  expect(showNotification).toHaveBeenCalledWith(
    'Ready',
    expect.objectContaining({ body: '3 games', data: { hash: '#/overview' } }),
  );
  expect(made).toHaveLength(0);
});

test('a worker that cannot show it falls back to the constructor', async () => {
  const { made } = stubNotification('granted');
  stubWorker({
    showNotification: vi.fn(async () => {
      throw new TypeError('no active worker');
    }),
  });
  await notify(alert);
  expect(made).toHaveLength(1);
});

test('a constructor that throws, as on Android, is swallowed', async () => {
  const { Fake } = stubNotification('granted');
  vi.stubGlobal(
    'Notification',
    Object.assign(
      function () {
        throw new TypeError('Illegal constructor');
      },
      { permission: Fake.permission },
    ),
  );
  await expect(notify(alert)).resolves.toBeUndefined();
});

test('the worker can send the page to a screen, and only an app screen', () => {
  const container = stubWorker(undefined);
  const stop = followNotificationClicks();
  const send = (data: unknown) =>
    container.dispatchEvent(new MessageEvent('message', { data }));

  send({ type: 'open', hash: '#/overview' });
  expect(location.hash).toBe('#/overview');
  send({ type: 'open', hash: 'https://elsewhere.test' });
  send({ type: 'other', hash: '#/games' });
  expect(location.hash).toBe('#/overview');

  stop();
  send({ type: 'open', hash: '#/games' });
  expect(location.hash).toBe('#/overview');
});
