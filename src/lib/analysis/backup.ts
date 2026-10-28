// A backup file: the saved reviews and the drill progress, as one JSON text, so
// they can move to another browser or survive cleared site data. Settings stay
// out: they are per device and cost a few clicks.

import { parseStored, type AnalysisStore } from './cache';
import { parseProgress, type ProgressStore } from './drill-progress';

const APP = 'deeprook';
const BACKUP_VERSION = 1;

export async function exportBackup(
  store: AnalysisStore | null,
  progress: ProgressStore | null,
): Promise<string> {
  const [reviews, drills] = await Promise.all([
    store?.list() ?? [],
    progress?.list() ?? [],
  ]);
  return JSON.stringify({ app: APP, version: BACKUP_VERSION, reviews, drills });
}

/**
 * Puts a backup's reviews and drills back, next to what is already here. A
 * review never replaces a deeper one and a drill keeps its later answer. Throws
 * if the text is not a backup; records inside it that are not valid are skipped.
 */
export async function importBackup(
  text: string,
  store: AnalysisStore | null,
  progress: ProgressStore | null,
): Promise<{ reviews: number; drills: number }> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not a DeepRook backup.');
  }
  const file = raw as Record<string, unknown> | null;
  if (file?.app !== APP || !Array.isArray(file.reviews))
    throw new Error('This file is not a DeepRook backup.');
  if (file.version !== BACKUP_VERSION || !Array.isArray(file.drills))
    throw new Error('This backup is from a different version of DeepRook.');

  const reviews = file.reviews.map(parseStored).filter((r) => r !== null);
  const drills = file.drills.map(parseProgress).filter((d) => d !== null);
  await Promise.all([
    store && Promise.all(reviews.map((r) => store.save(r))),
    progress?.restore(drills),
  ]);
  return { reviews: reviews.length, drills: drills.length };
}
