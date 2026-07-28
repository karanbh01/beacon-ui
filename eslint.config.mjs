import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: ['out/**', 'dist/**', 'release/**', 'node_modules/**', 'coverage/**']
  },
  js.configs.recommended,

  // Type-aware strict rules. `strictTypeChecked` is what makes the lint pass
  // worth running at all next to tsc: it catches floating promises, unsafe
  // any-propagation and misused thenables, none of which are type errors.
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.web.json'],
        tsconfigRootDir: import.meta.dirname
      }
    }
  },

  // Renderer-only rules.
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
    }
  },

  // Test files: assertion helpers make some strict rules noise.
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off'
    }
  },

  // Config files sit outside both tsconfig projects.
  {
    files: ['*.config.{js,mjs,ts}', 'eslint.config.mjs'],
    languageOptions: {
      parserOptions: { project: null }
    },
    ...tseslint.configs.disableTypeChecked
  },

  // Must stay last: turns off everything prettier owns.
  prettier
)
