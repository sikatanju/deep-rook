import { GamePicker } from '@/components/game-picker/game-picker';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';

export default function App() {
  return (
    <ThemeProvider>
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">DeepRook</h1>
          <ThemeToggle />
        </header>
        <GamePicker />
      </main>
    </ThemeProvider>
  );
}
