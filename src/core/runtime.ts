export type TaskStatus = "running" | "completed" | "failed" | "cancelled"

export interface KernelTask {
  id: string
  description: string
  agent: string
  status: TaskStatus
  result?: string
  error?: string
  createdAt: number
  updatedAt: number
}

function randomTaskID(): string {
  return `task_${Math.random().toString(36).slice(2, 10)}`
}

export class KernelRuntime {
  private readonly tasks = new Map<string, KernelTask>()

  createTask(input: { description: string; agent: string }): KernelTask {
    const now = Date.now()
    const task: KernelTask = {
      id: randomTaskID(),
      description: input.description,
      agent: input.agent,
      status: "running",
      createdAt: now,
      updatedAt: now,
    }
    this.tasks.set(task.id, task)
    return task
  }

  completeTask(taskID: string, result: string): KernelTask | null {
    const task = this.tasks.get(taskID)
    if (!task) return null
    task.status = "completed"
    task.result = result
    task.updatedAt = Date.now()
    return task
  }

  failTask(taskID: string, error: string): KernelTask | null {
    const task = this.tasks.get(taskID)
    if (!task) return null
    task.status = "failed"
    task.error = error
    task.updatedAt = Date.now()
    return task
  }

  cancelTask(taskID: string): KernelTask | null {
    const task = this.tasks.get(taskID)
    if (!task) return null
    task.status = "cancelled"
    task.updatedAt = Date.now()
    return task
  }

  getTask(taskID: string): KernelTask | null {
    return this.tasks.get(taskID) ?? null
  }
}
