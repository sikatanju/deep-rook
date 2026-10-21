import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist', '.astro', 'src/components/ui'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  jsxA11y.flatConfigs.recommended,
  { languageOptions: { globals: globals.browser } },
  {
    files: ['src/sw/sw.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        __VERSION__: 'readonly',
        __PRECACHE__: 'readonly',
      },
    },
  },
  {
    // The engine runs in workers behind the analyzer; UI code goes through useGameAnalysis.
    files: ['src/components/**', 'src/app/**', 'src/pages/**'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/lib/engine/*',
                '**/workers/*',
                '**/lib/analysis/analyzer',
                '**/lib/analysis/schedule',
                '**/lib/analysis/protocol',
              ],
              message:
                'Analysis internals are private. Use useGameAnalysis from @/hooks/use-game-analysis.',
            },
          ],
        },
      ],
    },
  },
);
