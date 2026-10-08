import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function App() {
  return (
    <ThemeProvider>
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">DeepRook</h1>
          <ThemeToggle />
        </header>
        <Card>
          <CardHeader>
            <CardTitle>Chess analysis, in your browser</CardTitle>
            <CardDescription>
              Scaffold only. The engine and board come later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button>Analyze a game</Button>
          </CardContent>
        </Card>
      </main>
    </ThemeProvider>
  );
}
