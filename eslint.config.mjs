import nextVitals from 'eslint-config-next/core-web-vitals'

const config = [
  ...nextVitals,
  {
    ignores: [
      '.next/**',
      'out/**',
      'server/dist/**',
      'node_modules/**',
      'tsconfig.tsbuildinfo',
      'ops/vm/dist/**',
      'scripts/dist/**',
    ],
  },
]

export default config
