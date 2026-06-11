import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import noArbitraryTextSize from './eslint-local/no-arbitrary-text-size.js'

export default defineConfig([
  globalIgnores(['dist', 'eslint-local']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: {
      // Reglas locales del design system (Fase 2), sin deps npm nuevas.
      ds: { rules: { 'no-arbitrary-text-size': noArbitraryTextSize } },
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Anti-regresión Design System (Fase 2). Severidad 'warn' por ahora:
      // hay ~326 <button> crudos y ~568 text-[Npx] existentes; se migran por
      // página (F2.2+) y se flipea a 'error' al cerrar F2. Lint NO está en el
      // gate de deploy → estas reglas son guía local, no bloquean build.
      'no-restricted-syntax': ['warn', {
        selector: 'JSXOpeningElement[name.name="button"]',
        message: 'Usa <Button>/<IconButton> de components/ui en vez de <button> crudo (design system, Fase 2). Excepción legítima: // eslint-disable-next-line no-restricted-syntax',
      }],
      'ds/no-arbitrary-text-size': 'warn',
    },
  },
])
