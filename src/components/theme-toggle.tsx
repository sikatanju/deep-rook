import { MoonIcon, SunIcon } from 'lucide-react';

import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <Button
      variant="outline"
      size="icon"
      aria-pressed={dark}
      onClick={toggleTheme}
    >
      {dark ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
      <span className="sr-only">Dark mode</span>
    </Button>
  );
}
