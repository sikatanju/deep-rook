import { expect, test } from 'vitest';

import { exportBackup, importBackup } from './backup';
import { memoryStore } from './cache';
import { memoryProgress } from './drill-progress';
import { stored } from './fixtures';

test('a backup carries reviews and drill progress into an empty browser', async () => {
  const store = memoryStore();
  const progress = memoryProgress();
  await store.save(stored());
  await progress.record('a', 'first-try', 5);
  const text = await exportBackup(store, progress);

  const fresh = memoryStore();
  const freshProgress = memoryProgress();
  expect(await importBackup(text, fresh, freshProgress)).toEqual({
    reviews: 1,
    drills: 1,
  });
  expect(await fresh.list()).toEqual(await store.list());
  expect(await freshProgress.list()).toEqual(await progress.list());
});

test('records that are not valid are skipped, and files that are not backups throw', async () => {
  const good = JSON.parse(await exportBackup(memoryStore(), memoryProgress()));
  const text = JSON.stringify({
    ...good,
    reviews: [{ key: 'broken' }],
    drills: [{ id: 'a', box: 99 }],
  });
  const store = memoryStore();
  expect(await importBackup(text, store, memoryProgress())).toEqual({
    reviews: 0,
    drills: 0,
  });
  expect(await store.list()).toEqual([]);

  for (const bad of ['not json', '[]', '{"app":"other"}'])
    await expect(importBackup(bad, store, null)).rejects.toThrow(
      'not a DeepRook backup',
    );
  await expect(
    importBackup(JSON.stringify({ ...good, version: 9 }), store, null),
  ).rejects.toThrow('different version');
});

test('an import never replaces a deeper review', async () => {
  const store = memoryStore();
  await store.save(stored({ level: 'balanced' }));
  const shallow = memoryStore();
  await shallow.save(stored({ level: 'fast' }));
  await importBackup(await exportBackup(shallow, null), store, null);
  expect((await store.list())[0]!.level).toBe('balanced');
});
