import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': true }],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='console'][callee.property.name='log']",
          message: 'console.log禁止: loggerを使用',
        },
      ],
    },
  },
])

export default eslintConfig
