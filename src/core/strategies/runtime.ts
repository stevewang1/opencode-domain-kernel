import { KernelRuntime } from "../runtime.js"
import type { BackgroundResult, ChiefTaskInput, ChiefTaskResult, TaskExecutionStrategy } from "../strategy.js"
import type { DomainProfile } from "../types.js"

export class RuntimeExecutionStrategy implements TaskExecutionStrategy {
  constructor(
    private readonly runtime: KernelRuntime,
    private readonly profile: DomainProfile
  ) {}

  async executeChiefTask(input: ChiefTaskInput): Promise<ChiefTaskResult> {
    const task = this.runtime.createTask({
      description: input.description || input.prompt,
      agent: input.subagentType,
    })

    if (input.runInBackground) {
      return {
        output: [
          `Task launched in background.`,
          `Task ID: ${task.id}`,
          `Profile: ${this.profile.name}`,
          `Agent: ${input.subagentType}`,
        ].join("\n"),
        taskID: task.id,
      }
    }

    const result = [
      `Profile: ${this.profile.name}`,
      `Agent: ${input.subagentType}`,
      `Mode: direct`,
      `Task: ${input.prompt}`,
    ].join("\n")

    this.runtime.completeTask(task.id, result)

    return { output: result, taskID: task.id }
  }

  async getBackgroundOutput(taskID: string): Promise<BackgroundResult> {
    const task = this.runtime.getTask(taskID)
    if (!task) return { output: `Task not found: ${taskID}` }
    if (task.status === "running") return { output: `Task is still running.\nTask ID: ${task.id}` }
    if (task.status === "cancelled") return { output: `Task was cancelled.\nTask ID: ${task.id}` }
    if (task.status === "failed") return { output: `Task failed.\nTask ID: ${task.id}\nError: ${task.error ?? "unknown"}` }
    return { output: task.result ?? `Task completed.\nTask ID: ${task.id}` }
  }

  async cancelBackgroundTask(taskID: string): Promise<BackgroundResult> {
    const task = this.runtime.cancelTask(taskID)
    if (!task) return { output: `Task not found: ${taskID}` }
    return { output: `Task cancelled.\nTask ID: ${task.id}` }
  }
}
