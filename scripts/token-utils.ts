const synonymMap: Record<string, string[]> = {
  complete: ['done', 'finish', 'toggle'],
  completed: ['done', 'finish'],
  finishing: ['complete'],
  item: ['todo', 'task'],
  items: ['todos', 'tasks'],
  invert: ['toggle', 'flip', 'switch'],
  boolean: ['flag'],
  toggle: ['switch', 'flip', 'invert'],
  done: ['complete', 'finished'],
  task: ['todo'],
  todo: ['task'],
  title: ['name'],
}

export const tokenize = (text: string): string[] => {
  const normalized = text.toLowerCase()
  const matches = normalized.match(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu) ?? []
  if (matches.length === 0) return []

  const counts = new Map<string, number>()
  for (const term of matches) {
    counts.set(term, (counts.get(term) ?? 0) + 1)
    const synonyms = synonymMap[term]
    if (!synonyms) continue
    for (const alt of synonyms) {
      counts.set(alt, (counts.get(alt) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries()).flatMap(([term, freq]) => Array.from({ length: freq }, () => term))
}
