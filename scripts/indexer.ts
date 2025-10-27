import fs from 'node:fs'
import path from 'node:path'
import { Project, SyntaxKind } from 'ts-morph'

import { logger } from './logger'

const project = new Project({ tsConfigFilePath: 'tsconfig.json' })
const files = project.addSourceFilesAtPaths('src/**/*.{ts,tsx}')
const index: Array<{
  id: string
  kind: string
  name: string | undefined
  file: string
  start: number
  end: number
  text: string
}> = []

for (const file of files) {
  const filePath = file.getFilePath()
  const relativePath = path.relative(process.cwd(), filePath)
  const fileText = file.getFullText()

  for (const fn of file.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
    const name = fn.getName() ?? '(anonymous)'
    const start = fn.getStart()
    const end = fn.getEnd()
    index.push({
      id: `${relativePath}#${name}:${start}`,
      kind: 'function',
      name,
      file: relativePath,
      start,
      end,
      text: fileText.slice(start, end),
    })
  }
  for (const cls of file.getDescendantsOfKind(SyntaxKind.ClassDeclaration)) {
    const name = cls.getName() ?? '(anonymous)'
    const start = cls.getStart()
    const end = cls.getEnd()
    index.push({
      id: `${relativePath}#${name}:${start}`,
      kind: 'class',
      name,
      file: relativePath,
      start,
      end,
      text: fileText.slice(start, end),
    })
  }

  for (const method of file.getDescendantsOfKind(SyntaxKind.MethodDeclaration)) {
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

    index.push({
      id: `${relativePath}#${qualifiedName}:${start}`,
      kind: 'method',
      name: qualifiedName,
      file: relativePath,
      start,
      end,
      text: fileText.slice(start, end),
    })
  }

  for (const variable of file.getVariableDeclarations()) {
    const statement = variable.getFirstAncestorByKind(SyntaxKind.VariableStatement)
    if (!statement?.isExported()) continue

    const name = variable.getName()
    const start = variable.getStart()
    const end = variable.getEnd()

    index.push({
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

fs.writeFileSync('.rag/index.json', JSON.stringify(index, null, 2))
logger.info('Index build complete', { declarations: index.length })
