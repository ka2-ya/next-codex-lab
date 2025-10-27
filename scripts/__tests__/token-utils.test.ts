import { describe, expect, it } from 'vitest'

import { tokenize } from '../token-utils'

describe('tokenize', () => {
  it('normalizes and returns tokens', () => {
    expect(tokenize('Toggle Todo')).toEqual(['toggle', 'switch', 'flip', 'invert', 'todo', 'task'])
  })

  it('counts synonyms along with original terms', () => {
    const tokens = tokenize('complete item')
    expect(tokens).toEqual(
      expect.arrayContaining(['complete', 'done', 'finish', 'toggle', 'item', 'todo', 'task']),
    )
    const completeCount = tokens.filter((token) => token === 'complete').length
    expect(completeCount).toBeGreaterThan(0)
  })

  it('returns empty array for strings without words', () => {
    expect(tokenize('***')).toEqual([])
  })
})
