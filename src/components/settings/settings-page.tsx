import { BOARD_THEMES, useStore, type BoardTheme } from '@/app/store';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ANALYSIS_LEVELS, LEVELS } from '@/lib/analysis/levels';
import { cn } from '@/lib/utils';

export function SettingsPage() {
  const { settings, setSettings } = useStore();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>Saved in this browser.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Analysis depth</legend>
          <p className="text-sm opacity-70">
            The engine runs on your device. Deeper analysis is stronger and
            takes longer.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {LEVELS.map((level) => (
              <label
                key={level}
                className={cn(
                  'has-[:focus-visible]:ring-ring flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm has-[:focus-visible]:ring-2',
                  settings.analysisLevel === level &&
                    'border-primary bg-accent',
                )}
              >
                <input
                  type="radio"
                  name="analysis-level"
                  className="sr-only"
                  checked={settings.analysisLevel === level}
                  onChange={() => setSettings({ analysisLevel: level })}
                />
                <span className="font-medium">
                  {ANALYSIS_LEVELS[level].label}
                </span>
                <span className="opacity-70">
                  {ANALYSIS_LEVELS[level].blurb}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Board colors</legend>
          <div className="flex flex-wrap gap-3">
            {(Object.keys(BOARD_THEMES) as BoardTheme[]).map((name) => (
              <label
                key={name}
                className={cn(
                  'has-[:focus-visible]:ring-ring flex cursor-pointer flex-col items-center gap-1 rounded-md border p-2 text-sm capitalize has-[:focus-visible]:ring-2',
                  settings.boardTheme === name && 'border-primary bg-accent',
                )}
              >
                <input
                  type="radio"
                  name="board-theme"
                  className="sr-only"
                  checked={settings.boardTheme === name}
                  onChange={() => setSettings({ boardTheme: name })}
                />
                <span className="grid size-12 grid-cols-2 overflow-hidden rounded">
                  {[0, 1, 1, 0].map((dark, i) => (
                    <span
                      key={i}
                      style={{
                        background: dark
                          ? BOARD_THEMES[name].dark
                          : BOARD_THEMES[name].light,
                      }}
                    />
                  ))}
                </span>
                {name}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.coordinates}
            onChange={(e) => setSettings({ coordinates: e.target.checked })}
          />
          Show board coordinates
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            Autoplay speed ({(settings.autoplayMs / 1000).toFixed(1)}s per move)
          </span>
          <input
            type="range"
            min={300}
            max={2500}
            step={100}
            value={settings.autoplayMs}
            onChange={(e) =>
              setSettings({ autoplayMs: Number(e.target.value) })
            }
            className="max-w-xs"
          />
        </label>

        <p className="text-xs opacity-60">
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
      </CardContent>
    </Card>
  );
}
