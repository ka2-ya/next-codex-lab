import { randomUUID } from 'node:crypto'
import { NewTodo, Todo, TodoId } from '@/domain/todo'

const store = new Map<string, Todo>()

export const TodoRepo = {
  add(input: unknown): Todo {
    const data = NewTodo.parse(input)
    const todo: Todo = {
      id: randomUUID(),
      title: data.title,
      done: false,
      createdAt: new Date().toISOString(),
    }
    store.set(todo.id, todo)
    return todo
  },
  list(): Todo[] {
    return [...store.values()]
  },
  toggle(id: unknown): Todo {
    const tid = TodoId.parse(id)
    const existing = store.get(tid)
    if (!existing) throw new Error('NotFound')
    const updated = { ...existing, done: !existing.done }
    store.set(tid, updated)
    return updated
  },
}
