import { useMemo } from 'react';

import { useStore } from '@/app/store';
import { Board } from '@/components/board/board';
import { Highlight, PageHeader } from '@/components/layout/page-header';
import { LevelPicker } from '@/components/level-picker';
import { Panel } from '@/components/panel';
import { EvalBar } from '@/components/review/eval-bar';
import { BoardThemePicker } from '@/components/settings/board-theme-picker';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { fenAt, OPERA_GAME, parseReplay } from '@/lib/chess/replay';
import { PALETTES } from '@/lib/palettes';

// 22... Nbd7 in the Opera Game: a position with a last move, a grade and a next
// move to point at, so every setting below shows up in the preview.
const PREVIEW_PLY = 22;

const label = 'text-xs leading-4 font-extrabold tracking-[0.08em] uppercase';

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
            Pieces are{' '}
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
