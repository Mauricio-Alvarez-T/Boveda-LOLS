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
      // Anti-regresión Design System. F2 CERRADA (2026-06-15): los ~326 <button>
      // crudos y ~568 text-[Npx] originales fueron migrados a primitivas
      // (Button/IconButton) o tokens, o conservados con eslint-disable justificado.
      // Severidad 'error' para impedir regresiones. Excepción legítima por línea:
      // // eslint-disable-next-line no-restricted-syntax -- <razón>
      'no-restricted-syntax': ['error', {
        selector: 'JSXOpeningElement[name.name="button"]',
        message: 'Usa <Button>/<IconButton> de components/ui en vez de <button> crudo (design system, Fase 2). Excepción legítima: // eslint-disable-next-line no-restricted-syntax',
      }],
      'ds/no-arbitrary-text-size': 'error',
    },
  },
])
