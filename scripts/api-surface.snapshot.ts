import fs from 'node:fs'
import { Project } from 'ts-morph'

import { logger } from './logger'

const SNAP = '.rag/api-surface.json'
const p = new Project({ tsConfigFilePath: 'tsconfig.json' })
p.addSourceFilesAtPaths('src/**/*.{ts,tsx}')

type Entry = {
  file: string
  exports: Array<{ name: string; kind: 'function' | 'class' | 'const' | 'let'; signature?: string }>
}
const surface: Entry[] = []

for (const sourceFile of p.getSourceFiles()) {
  const file = sourceFile.getFilePath().replace(`${process.cwd()}/`, '')
  const list: Entry = { file, exports: [] }
  for (const [name, declarations] of sourceFile.getExportedDeclarations().entries()) {
    const declaration = declarations[0]
    if (!declaration) continue
    const kindName = declaration.getKindName().toLowerCase()
    let exportKind: Entry['exports'][number]['kind'] | undefined
    if (kindName.includes('function')) exportKind = 'function'
    else if (kindName.includes('class')) exportKind = 'class'
    else if (kindName.includes('variable')) {
      const text = declaration.getText()
      exportKind = text.startsWith('const') ? 'const' : 'let'
    } else continue
    const signature = exportKind === 'function' ? declaration.getText().split('{')[0]?.trim() : undefined
    list.exports.push({ name, kind: exportKind, signature })
  }
  if (list.exports.length) surface.push(list)
}

fs.mkdirSync('.rag', { recursive: true })
fs.writeFileSync(SNAP, JSON.stringify(surface, null, 2))
logger.info(`snapshot written: ${SNAP}`)
