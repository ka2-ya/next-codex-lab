import fs from 'node:fs'
import path from 'node:path'
import { Project } from 'ts-morph'

import { logger } from './logger'

type IndexEntry = {
  id: string
  file: string
  name?: string
}

type GraphNode = {
  id: string
  file: string
  name?: string
}

type Graph = {
  nodes: Record<string, GraphNode>
  imports: Record<string, string[]>
  calls: Record<string, string[]>
}

const indexPath = '.rag/index.json'

if (!fs.existsSync(indexPath)) {
  logger.error('Missing index. Run `pnpm index:build` first.')
  process.exit(1)
}

const toPosix = (value: string) => value.replace(/\\/g, '/')

const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as IndexEntry[]
const project = new Project({ tsConfigFilePath: 'tsconfig.json' })
const sourceFiles = project.addSourceFilesAtPaths('src/**/*.{ts,tsx}')

const graph: Graph = { nodes: {}, imports: {}, calls: {} }

for (const entry of index) {
  const file = toPosix(entry.file)
  graph.nodes[entry.id] = {
    id: entry.id,
    file,
    name: entry.name,
  }
}

const nodesByFile = new Map<string, Array<{ id: string; name?: string }>>()
for (const entry of index) {
  const file = toPosix(entry.file)
  if (!nodesByFile.has(file)) nodesByFile.set(file, [])
  nodesByFile.get(file)!.push({ id: entry.id, name: entry.name })
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\$&')

for (const file of sourceFiles) {
  const absolutePath = file.getFilePath()
  const relativePath = toPosix(path.relative(process.cwd(), absolutePath))
  const imports = new Set<string>()

  for (const decl of file.getImportDeclarations()) {
    const target = decl.getModuleSpecifierSourceFile()
    if (target) {
      const resolved = toPosix(path.relative(process.cwd(), target.getFilePath()))
      imports.add(resolved)
    } else {
      imports.add(decl.getModuleSpecifierValue())
    }
  }

  graph.imports[relativePath] = Array.from(imports)

  const fileText = file.getFullText()
  const nodes = nodesByFile.get(relativePath) ?? []
  for (const node of nodes) {
    if (!node.name) continue
    const segments = node.name.split('.')
    const symbol = segments[segments.length - 1]
    if (!symbol) continue
    const pattern = new RegExp(`\\b${escapeRegex(symbol)}\\s*\\(`, 'g')
    if (pattern.test(fileText)) {
      const callers = graph.calls[node.id] ?? []
      if (!callers.includes(relativePath)) callers.push(relativePath)
      graph.calls[node.id] = callers
    }
  }
}

fs.mkdirSync('.rag', { recursive: true })
fs.writeFileSync('.rag/graph.json', JSON.stringify(graph, null, 2))
logger.json({
  message: 'Graph build complete',
  nodes: Object.keys(graph.nodes).length,
  files: sourceFiles.length,
})
