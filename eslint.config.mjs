import path from 'node:path'
import { fileURLToPath } from 'node:url'

import nextVitals from 'eslint-config-next/core-web-vitals'
import tseslint from 'typescript-eslint'

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url))
const typedFiles = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts']
const strictTypeChecked = tseslint.configs.strictTypeChecked.map((entry) => (
  'files' in entry
    ? entry
    : {
        ...entry,
        files: typedFiles,
      }
))

const config = tseslint.config(
  ...nextVitals,
  ...strictTypeChecked,
  {
    files: typedFiles,
    languageOptions: {
      parserOptions: {
        project: [
          './tsconfig.json',
          './server/tsconfig.json',
          './scripts/tsconfig.json',
          './ops/vm/tsconfig.scripts.json',
        ],
        tsconfigRootDir,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
        },
      ],
      '@typescript-eslint/no-deprecated': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unused-expressions': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
          allowBoolean: true,
        },
      ],
      '@typescript-eslint/return-await': ['error', 'always'],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'import/no-anonymous-default-export': 'error',
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      curly: ['error', 'all'],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    ignores: [
      '.next/**',
      'coverage/**',
      'out/**',
      'server/dist/**',
      'server/coverage/**',
      'node_modules/**',
      'tsconfig.tsbuildinfo',
      'ops/vm/dist/**',
      'scripts/dist/**',
    ],
  },
)

export default config
