const toLine = (parts: unknown[]) =>
  parts
    .map((part) => {
      if (typeof part === 'string') return part
      if (part instanceof Error) return part.stack ?? part.message
      try {
        return JSON.stringify(part)
      } catch {
        return String(part)
      }
    })
    .join(' ')

const write = (stream: NodeJS.WriteStream, parts: unknown[]) => {
  stream.write(`${toLine(parts)}\n`)
}

export const logger = {
  info: (...parts: unknown[]) => write(process.stdout, parts),
  warn: (...parts: unknown[]) => write(process.stderr, parts),
  error: (...parts: unknown[]) => write(process.stderr, parts),
  json: (value: unknown) => {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
  },
}
