import { createTodo, toggleTodo } from './actions'
import { TodoRepo } from '@/server/repos/todoRepo'

export default function Page() {
  const todos = TodoRepo.list()

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">next-codex-lab</h1>
      <form action={createTodo} className="flex gap-2">
        <input
          name="title"
          placeholder="Add todo"
          className="flex-1 border px-2 py-1"
        />
        <button type="submit" className="border px-3 py-1">
          Add
        </button>
      </form>
      <ul className="space-y-2">
        {todos.map((todo) => (
          <li key={todo.id} className="flex items-center gap-2">
            <form action={toggleTodo}>
              <input type="hidden" name="id" value={todo.id} />
              <button
                aria-label={`toggle ${todo.title}`}
                className="border px-2 py-1"
              >
                {todo.done ? '✅' : '⬜️'}
              </button>
            </form>
            <span className={todo.done ? 'line-through' : ''}>{todo.title}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
