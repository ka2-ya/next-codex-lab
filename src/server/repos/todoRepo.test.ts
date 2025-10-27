import { describe, expect, it } from 'vitest'
import { TodoRepo } from './todoRepo'

describe('TodoRepo', () => {
  it('adds and toggles a todo', () => {
    const todo = TodoRepo.add({ title: 'x' })
    expect(TodoRepo.list().length).toBe(1)
    const toggled = TodoRepo.toggle(todo.id)
    expect(toggled.done).toBe(true)
  })
})
