import { z } from 'zod'

export const TodoId = z.string().uuid()

export const Todo = z.object({
  id: TodoId,
  title: z.string().min(1),
  done: z.boolean().default(false),
  createdAt: z.string(),
})

export type Todo = z.infer<typeof Todo>

export const NewTodo = z.object({ title: z.string().min(1) })
