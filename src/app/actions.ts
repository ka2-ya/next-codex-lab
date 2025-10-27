'use server'

import { revalidatePath } from 'next/cache'
import { TodoRepo } from '@/server/repos/todoRepo'

export async function createTodo(formData: FormData) {
  const title = formData.get('title')
  TodoRepo.add({ title })
  revalidatePath('/')
}

export async function toggleTodo(formData: FormData) {
  const id = formData.get('id')
  TodoRepo.toggle(id)
  revalidatePath('/')
}
