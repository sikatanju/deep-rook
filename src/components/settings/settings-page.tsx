import { useMemo, useRef, useState } from 'react';

import { useStore } from '@/app/store';
import { Board } from '@/components/board/board';
import { Highlight, PageHeader } from '@/components/layout/page-header';
import { LevelPicker } from '@/components/level-picker';
import { Panel } from '@/components/panel';
import { EvalBar } from '@/components/review/eval-bar';
import { BoardThemePicker } from '@/components/settings/board-theme-picker';
import { PieceSetPicker } from '@/components/settings/piece-set-picker';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  useAnalysisStore,
  useAnalyzer,
  useBatch,
  useDrillProgress,
} from '@/hooks/use-game-analysis';
import { useSavedReviews } from '@/hooks/use-saved-reviews';
import { exportBackup, importBackup } from '@/lib/analysis/backup';
import { isActive } from '@/lib/analysis/batch';
import { fenAt, OPERA_GAME, parseReplay } from '@/lib/chess/replay';
import { PALETTES } from '@/lib/palettes';

// 22... Nbd7 in the Opera Game: a position with a last move, a grade and a next
// move to point at, so every setting below shows up in the preview.
const PREVIEW_PLY = 22;

const label = 'text-xs leading-4 font-extrabold tracking-[0.08em] uppercase';

/** Two presses, so a stray click cannot wipe the saved reviews. */
function SavedReviews() {
  const { available, records, clear } = useSavedReviews();
  const { loaded, forgetOpenReview, settings, setSettings } = useStore();
  const analyzer = useAnalyzer();
  const batch = useBatch();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const reviews = useAnalysisStore();
  const drills = useDrillProgress();
  const count = records?.length ?? 0;
  const running = isActive(batch.snapshot);
  const nothing = (records === null || count === 0) && !loaded && !running;
  return (
    <Panel
      tag="Saved here"
      title="Saved reviews"
      subtitle="Finished reviews are kept in this browser, so reopening a game skips the engine and the Overview can show your progress. Clearing them also clears your drill history and the game a refresh would reopen. Palette, board, and pieces stay."
    >
      {!available && (
        <p className="text-ink-muted">
          This browser cannot save reviews. Each one is analyzed again when you
          open it.
        </p>
      )}
      {(available || loaded || running) && (
        <div className="flex flex-wrap items-center gap-4">
          {available && (
            <p aria-live="polite" className="font-bold">
              {records === null
                ? 'Counting…'
                : `${count} saved ${count === 1 ? 'review' : 'reviews'}`}
            </p>
          )}
          <Button
            size="sm"
            variant={confirming ? 'destructive' : 'default'}
            disabled={nothing}
            onBlur={() => setConfirming(false)}
            onClick={async () => {
              if (!confirming) return setConfirming(true);
              analyzer.drop();
              batch.cancel();
              forgetOpenReview();
              await clear();
              setConfirming(false);
            }}
          >
            {confirming ? 'Click again to clear' : 'Clear saved reviews'}
          </Button>
        </div>
      )}
      {available && (
        <div className="flex flex-wrap items-center gap-4">
          <Button
            size="sm"
            disabled={count === 0}
            onClick={async () => {
              const text = await exportBackup(reviews, drills, {
                boardSize: settings.boardSize,
              });
              const link = document.createElement('a');
              link.href = URL.createObjectURL(
                new Blob([text], { type: 'application/json' }),
              );
              link.download = `deeprook-backup-${new Date().toISOString().slice(0, 10)}.json`;
              link.click();
              URL.revokeObjectURL(link.href);
              setNote('Backup downloaded.');
            }}
          >
            Export backup
          </Button>
          <Button size="sm" onClick={() => picker.current?.click()}>
            Import backup
          </Button>
          <input
            ref={picker}
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="backup-file"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                const done = await importBackup(
                  await file.text(),
                  reviews,
                  drills,
                  setSettings,
                );
                setNote(
                  `Imported ${done.reviews} ${done.reviews === 1 ? 'review' : 'reviews'} and ${done.drills} drill ${done.drills === 1 ? 'record' : 'records'}.`,
                );
              } catch (error) {
                setNote(
                  error instanceof Error ? error.message : 'Import failed.',
                );
              }
            }}
          />
          <p aria-live="polite" className="text-ink-muted text-sm">
            {note}
          </p>
        </div>
      )}
    </Panel>
  );
}

export function SettingsPage() {
  const { settings, setSettings } = useStore();
  const replay = useMemo(() => parseReplay(OPERA_GAME), []);
  return (
    <>
      <PageHeader eyebrow="Saved in this browser">
        Make it <Highlight>yours</Highlight>
      </PageHeader>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="flex flex-col gap-8">
          <Panel
            tag="Engine"
            title="Review mode"
            subtitle="The mode preselected when you start a review. The engine runs on your device, and deeper modes are stronger and take longer."
          >
            <LevelPicker
              name="analysis-level"
              value={settings.analysisLevel}
              onChange={(analysisLevel) => setSettings({ analysisLevel })}
            />
          </Panel>

          <SavedReviews />

          <Panel tag="Look" title="Palette & board">
            <div className="flex flex-col gap-3">
              <p className={label}>Palette</p>
              <div
                role="group"
                aria-label="Palette"
                className="flex flex-wrap gap-3"
              >
                {PALETTES.map((p) => (
                  <Button
                    key={p.id}
                    size="sm"
                    variant={settings.palette === p.id ? 'primary' : 'default'}
                    aria-pressed={settings.palette === p.id}
                    onClick={() => setSettings({ palette: p.id })}
                  >
                    <span
                      aria-hidden
                      className="rounded-pill size-3.5 border-2 border-current"
                      style={{
                        background: `linear-gradient(90deg, ${p.a} 50%, ${p.b} 50%)`,
                      }}
                    />
                    {p.name}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <p className={label}>Board colors</p>
              <BoardThemePicker
                value={settings.boardTheme}
                onChange={(boardTheme) => setSettings({ boardTheme })}
              />
            </div>

            <div className="flex flex-col gap-3">
              <p className={label}>Pieces</p>
              <PieceSetPicker
                value={settings.pieceSet}
                onChange={(pieceSet) => setSettings({ pieceSet })}
              />
            </div>

            <div className="flex flex-wrap items-end gap-8">
              <label
                htmlFor="coordinates"
                className="inline-flex cursor-pointer items-center gap-2 font-bold"
              >
                <Checkbox
                  id="coordinates"
                  checked={settings.coordinates}
                  onChange={(e) =>
                    setSettings({ coordinates: e.target.checked })
                  }
                />
                Show board coordinates
              </label>
              <label
                htmlFor="sound"
                className="inline-flex cursor-pointer items-center gap-2 font-bold"
              >
                <Checkbox
                  id="sound"
                  checked={settings.sound}
                  onChange={(e) => setSettings({ sound: e.target.checked })}
                />
                Play sounds
              </label>
              <label
                htmlFor="autoplay-speed"
                className="flex w-full max-w-[340px] flex-col gap-2 font-bold"
              >
                <span className="flex items-center justify-between gap-3">
                  Autoplay speed
                  <output className="border-line bg-surface-alt rounded-sm border-2 px-1.5 font-mono text-sm">
                    {(settings.autoplayMs / 1000).toFixed(1)}s per move
                  </output>
                </span>
                <Slider
                  id="autoplay-speed"
                  min={300}
                  max={2500}
                  step={100}
                  value={settings.autoplayMs}
                  onChange={(e) =>
                    setSettings({ autoplayMs: Number(e.target.value) })
                  }
                />
              </label>
            </div>
          </Panel>

          <p className="text-ink-muted text-xs leading-4">
            <a
              href="https://github.com/neverRare/kiwen-suwi"
              className="underline"
            >
              Kiwen Suwi
            </a>{' '}
            by neverRare,{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              className="underline"
            >
              CC BY 4.0
            </a>
            .{' '}
            <a href="https://rhosgfx.itch.io/" className="underline">
              RhosGFX
            </a>
            ,{' '}
            <a
              href="https://creativecommons.org/publicdomain/zero/1.0/"
              className="underline"
            >
              CC0 1.0
            </a>
            .{' '}
            <a href="https://nikoichu.itch.io/" className="underline">
              Papercut
            </a>{' '}
            by Nikolay Anzarov,{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              className="underline"
            >
              CC BY 4.0
            </a>
            .
          </p>
        </div>

        <aside
          aria-label="Live preview"
          className="flex w-full max-w-80 flex-col gap-4 lg:sticky lg:top-8 lg:w-80"
        >
          <p className={label}>Live preview</p>
          <Board
            fen={fenAt(replay, PREVIEW_PLY)}
            flipped={false}
            theme={settings.boardTheme}
            pieceSet={settings.pieceSet}
            coordinates={settings.coordinates}
            lastMove={replay.plies[PREVIEW_PLY - 1]}
            arrow="e1c1"
            grade="good"
          />
          <EvalBar
            orientation="horizontal"
            flipped={false}
            score={{ kind: 'cp', cp: 300 }}
          />
        </aside>
      </div>
    </>
  );
}
