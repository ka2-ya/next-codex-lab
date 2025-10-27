import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { Project, SyntaxKind } from 'ts-morph'

import { tokenize } from './token-utils'
import { logger } from './logger'
import type { EmbeddedDocument, EmbeddingPayload, IndexEntry } from './types'

const INDEX_PATH = '.rag/index.json'
const EMBED_PATH = '.rag/embed.json'

interface Declaration {
  id: string
  kind: string
  name?: string
  file: string
  start: number
  end: number
  text: string
}

type Warning =
  | {
      type: 'name-duplicate'
      declaration: Declaration
      duplicates: IndexEntry[]
    }
  | {
      type: 'semantic-similarity'
      declaration: Declaration
      matches: Array<{ doc: EmbeddedDocument; score: number }>
    }

function runGit(args: string[]): string {
  try {
    return execSync(['git', ...args].join(' '), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function getChangedFiles(): string[] {
  const staged = runGit(['diff', '--name-only', '--cached'])
  let raw = staged

  if (!raw) {
    raw = runGit(['diff', '--name-only'])
  }

  if (!raw) {
    const baseRef = process.env.REVIEW_CHECK_BASE || process.env.GITHUB_BASE_REF
    if (baseRef) {
      const qualified = baseRef.startsWith('origin/') ? baseRef : `origin/${baseRef}`
      raw = runGit(['diff', '--name-only', `${qualified}...HEAD`])
    }
  }

  if (!raw) return []
  const files = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => file.startsWith('src/') && /\.tsx?$/.test(file) && !file.endsWith('.d.ts'))
  return Array.from(new Set(files))
}

function ensurePrerequisites() {
  if (!fs.existsSync(INDEX_PATH)) {
    logger.error('review:check ▶︎ missing .rag/index.json. Run `pnpm index:build` first.')
    process.exit(1)
  }
  if (!fs.existsSync(EMBED_PATH)) {
    logger.error('review:check ▶︎ missing .rag/embed.json. Run `pnpm embed:build` first.')
    process.exit(1)
  }
}

function loadIndex(): IndexEntry[] {
  const raw = fs.readFileSync(INDEX_PATH, 'utf8')
  return JSON.parse(raw) as IndexEntry[]
}

function loadEmbeddings(): EmbeddingPayload {
  const raw = fs.readFileSync(EMBED_PATH, 'utf8')
  return JSON.parse(raw) as EmbeddingPayload
}

function collectDeclarations(files: string[]): Declaration[] {
  if (files.length === 0) return []
  const project = new Project({ tsConfigFilePath: 'tsconfig.json' })
  const declarations: Declaration[] = []

  for (const relativePath of files) {
    const fullPath = path.resolve(relativePath)
    const source = project.addSourceFileAtPathIfExists(fullPath)
    if (!source) continue

    const fileText = source.getFullText()

    for (const fn of source.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
      const name = fn.getName() ?? '(anonymous)'
      const start = fn.getStart()
      const end = fn.getEnd()
      declarations.push({
        id: `${relativePath}#${name}:${start}`,
        kind: 'function',
        name,
        file: relativePath,
        start,
        end,
        text: fileText.slice(start, end),
      })
    }

    for (const cls of source.getDescendantsOfKind(SyntaxKind.ClassDeclaration)) {
      const name = cls.getName() ?? '(anonymous)'
      const start = cls.getStart()
      const end = cls.getEnd()
      declarations.push({
        id: `${relativePath}#${name}:${start}`,
        kind: 'class',
        name,
        file: relativePath,
        start,
        end,
        text: fileText.slice(start, end),
      })
    }

    for (const method of source.getDescendantsOfKind(SyntaxKind.MethodDeclaration)) {
      const methodName = method.getName() ?? '(anonymous)'
      const classAncestor = method.getFirstAncestorByKind(SyntaxKind.ClassDeclaration)
      const objectAncestor = method.getFirstAncestorByKind(SyntaxKind.ObjectLiteralExpression)
      let containerName = classAncestor?.getName()

      if (!containerName && objectAncestor) {
        const variableDecl = objectAncestor.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)
        containerName = variableDecl?.getName()
      }

      const qualifiedName = containerName ? `${containerName}.${methodName}` : methodName
      const start = method.getStart()
      const end = method.getEnd()
      declarations.push({
        id: `${relativePath}#${qualifiedName}:${start}`,
        kind: 'method',
        name: qualifiedName,
        file: relativePath,
        start,
        end,
        text: fileText.slice(start, end),
      })
    }

    for (const variable of source.getVariableDeclarations()) {
      const statement = variable.getFirstAncestorByKind(SyntaxKind.VariableStatement)
      if (!statement?.isExported()) continue
      const name = variable.getName()
      const start = variable.getStart()
      const end = variable.getEnd()
      declarations.push({
        id: `${relativePath}#${name}:${start}`,
        kind: 'variable',
        name,
        file: relativePath,
        start,
        end,
        text: fileText.slice(start, end),
      })
    }
  }

  return declarations
}

function computeVector(name: string | undefined, text: string, idf: Record<string, number>) {
  const tokens = tokenize(`${name ?? ''} ${text ?? ''}`)
  if (tokens.length === 0) return { vector: {}, norm: 0 }
  const termCounts = new Map<string, number>()
  for (const token of tokens) {
    termCounts.set(token, (termCounts.get(token) ?? 0) + 1)
  }
  const vector: Record<string, number> = {}
  let normSquared = 0
  for (const [term, count] of termCounts.entries()) {
    const idfValue = idf[term]
    if (!idfValue) continue
    const tf = count / tokens.length
    const weight = tf * idfValue
    if (weight === 0) continue
    vector[term] = weight
    normSquared += weight * weight
  }
  return { vector, norm: Math.sqrt(normSquared) }
}

function cosineSimilarity(vecA: Record<string, number>, vecB: Record<string, number>, normA: number, normB: number) {
  if (normA === 0 || normB === 0) return 0
  let dot = 0
  const shorter = Object.keys(vecA).length <= Object.keys(vecB).length ? vecA : vecB
  for (const term of Object.keys(shorter)) {
    const a = vecA[term]
    const b = vecB[term]
    if (a === undefined || b === undefined) continue
    dot += a * b
  }
  return dot / (normA * normB)
}

function main() {
  ensurePrerequisites()

  const targetFiles = getChangedFiles()
  if (targetFiles.length === 0) {
    logger.info('review:check ▶︎ no staged TypeScript/TSX changes detected.')
    return
  }

  const indexEntries = loadIndex()
  const embedStore = loadEmbeddings()
  const canScoreSimilarity = embedStore.documents.length > 0
  if (!canScoreSimilarity) {
    logger.warn('review:check ▶︎ embedding store is empty. Run `pnpm embed:build` to enable similarity scoring.')
  }
  const existingByName = new Map<string, IndexEntry[]>()
  for (const entry of indexEntries) {
    if (!entry.name) continue
    const list = existingByName.get(entry.name) ?? []
    list.push(entry)
    existingByName.set(entry.name, list)
  }

  const newDeclarations = collectDeclarations(targetFiles)
  if (newDeclarations.length === 0) {
    logger.info('review:check ▶︎ no declarations found in staged files.')
    return
  }

  const warnings: Warning[] = []

  for (const decl of newDeclarations) {
    if (decl.name) {
      const duplicates = (existingByName.get(decl.name) ?? []).filter((entry) => entry.file !== decl.file)
      if (duplicates.length > 0) {
        warnings.push({ type: 'name-duplicate', declaration: decl, duplicates })
      }
    }

    if (!canScoreSimilarity) continue

    const { vector, norm } = computeVector(decl.name, decl.text, embedStore.idf)
    if (norm === 0) continue

    const matches = embedStore.documents
      .filter((doc) => doc.file !== decl.file)
      .map((doc) => ({ doc, score: cosineSimilarity(vector, doc.vector, norm, doc.norm) }))
      .filter(({ score }) => score >= 0.55)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    if (matches.length > 0) {
      warnings.push({ type: 'semantic-similarity', declaration: decl, matches })
    }
  }

  if (warnings.length === 0) {
    logger.info('review:check ▶︎ no conflicting declarations detected.')
    return
  }

  logger.error('review:check ▶︎ potential conflicts found:')
  for (const warning of warnings) {
    const { declaration } = warning
    logger.error('')
    logger.error(`- ${warning.type === 'name-duplicate' ? 'Name duplicate' : 'Semantic similarity'}:`)
    logger.error(`  new  : ${declaration.name ?? '(anonymous)'} (${declaration.kind}) @ ${declaration.file}`)
    if (warning.type === 'name-duplicate') {
      for (const duplicate of warning.duplicates) {
        logger.error(`  match: ${duplicate.name ?? '(anonymous)'} (${duplicate.kind}) @ ${duplicate.file}`)
      }
    } else {
      for (const { doc, score } of warning.matches) {
        logger.error(`  match: ${doc.name ?? '(anonymous)'} (${doc.kind}) @ ${doc.file} score=${score.toFixed(3)}`)
      }
    }
  }
  process.exitCode = 1
}

main()
