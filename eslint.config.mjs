import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    // Flat config does not read .gitignore, so build output has to be listed
    // here too or a local build makes `pnpm lint` fail on generated bundles.
    ignores: [
      'out/**',
      'dist/**',
      'release/**',
      'node_modules/**',
      'coverage/**',
      'storybook-static/**',
      // Generated from py-beacon's OpenAPI spec. Its style is openapi-
      // typescript's business, not ours, and it is still typechecked — which
      // is the part that actually makes the client safe.
      'src/shared/api.generated.ts'
    ]
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
        project: ['./tsconfig.node.json', './tsconfig.web.json', './tsconfig.e2e.json'],
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

  // Config files and build scripts sit outside both tsconfig projects, so the
  // type-aware rules have no program to resolve them against.
  {
    files: [
      '*.config.{js,mjs,ts}',
      'eslint.config.mjs',
      'scripts/**/*.{js,mjs}',
      '.storybook/**/*.{ts,tsx}'
    ],
    // Spread first: disableTypeChecked carries its own languageOptions and
    // would otherwise clobber the globals below.
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      parserOptions: { project: null },
      // `fetch` is global from Node 18; the packaging script downloads with
      // it. `Buffer` is how the icon script assembles the .ico container.
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly'
      }
    }
  },

  // Must stay last: turns off everything prettier owns.
  prettier
)
