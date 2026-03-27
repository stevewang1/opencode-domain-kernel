import { KernelRuntime } from "../runtime.js"
import type {
  BackgroundResult,
  ChiefTaskInput,
  ChiefTaskResult,
  RuntimeSessionClient,
  TaskExecutionStrategy,
} from "../strategy.js"
import type { DomainProfile } from "../types.js"

type BackgroundSessionTask = {
  id: string
  sessionID: string
  agent: string
  status: "running" | "completed" | "failed" | "cancelled"
  result?: string
  error?: string
}

export class RuntimeExecutionStrategy implements TaskExecutionStrategy {
  private readonly backgroundSessions = new Map<string, BackgroundSessionTask>()

  constructor(
    private readonly runtime: KernelRuntime,
    private readonly profile: DomainProfile,
    private readonly client?: RuntimeSessionClient
  ) {}

  private async getLatestAssistantText(sessionID: string): Promise<string> {
    if (!this.client) return ""
    const response = (await this.client.session.messages({
      path: { id: sessionID },
    } as unknown)) as { data?: Array<{ info?: { role?: string }; parts?: Array<{ type?: string; text?: string }> }> }
    const messages = response.data ?? []
    const assistant = [...messages].reverse().find((m) => m.info?.role === "assistant")
    if (!assistant) return ""
    return (assistant.parts ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .filter(Boolean)
      .join("\n")
  }

  private async createSubSession(parentSessionID: string, description: string): Promise<string | undefined> {
    if (!this.client) return undefined
    const response = (await this.client.session.create({
      body: {
        parentID: parentSessionID,
        title: `Task: ${description}`,
      },
    } as unknown)) as { data?: { id?: string }; error?: unknown }
    if (response.error) return undefined
    return response.data?.id
  }

  async executeChiefTask(input: ChiefTaskInput): Promise<ChiefTaskResult> {
    const task = this.runtime.createTask({
      description: input.description || input.prompt,
      agent: input.subagentType,
    })

    if (this.client && input.sessionID) {
      const sessionID = await this.createSubSession(input.sessionID, input.description || input.prompt)
      if (sessionID) {
        const promptBody = {
          path: { id: sessionID },
          body: {
            agent: input.subagentType,
            parts: [{ type: "text", text: input.prompt }],
          },
        } as unknown

        if (input.runInBackground) {
          this.backgroundSessions.set(task.id, {
            id: task.id,
            sessionID,
            agent: input.subagentType,
            status: "running",
          })

          this.client.session.promptAsync(promptBody)
            .then(async () => {
              const output = await this.getLatestAssistantText(sessionID)
              const current = this.backgroundSessions.get(task.id)
              if (!current || current.status === "cancelled") return
              current.status = "completed"
              current.result = output || `Task completed.\nSession ID: ${sessionID}`
              this.runtime.completeTask(task.id, current.result)
            })
            .catch((error) => {
              const current = this.backgroundSessions.get(task.id)
              if (!current || current.status === "cancelled") return
              current.status = "failed"
              current.error = error instanceof Error ? error.message : String(error)
              this.runtime.failTask(task.id, current.error)
            })

          return {
            output: [
              `Task launched in background.`,
              `Task ID: ${task.id}`,
              `Session ID: ${sessionID}`,
              `Profile: ${this.profile.name}`,
              `Agent: ${input.subagentType}`,
            ].join("\n"),
            taskID: task.id,
          }
        }

        try {
          await this.client.session.promptAsync(promptBody)
          const output = await this.getLatestAssistantText(sessionID)
          const result = [
            `Profile: ${this.profile.name}`,
            `Agent: ${input.subagentType}`,
            `Mode: direct`,
            `Session ID: ${sessionID}`,
            "",
            output || "(No text output)",
          ].join("\n")
          this.runtime.completeTask(task.id, result)
          return { output: result, taskID: task.id }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          this.runtime.failTask(task.id, message)
          return { output: `Task failed.\nTask ID: ${task.id}\nError: ${message}`, taskID: task.id }
        }
      }
    }

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
    const backgroundSession = this.backgroundSessions.get(taskID)
    if (backgroundSession) {
      if (backgroundSession.status === "running") {
        return {
          output: [
            `Task is still running.`,
            `Task ID: ${taskID}`,
            `Session ID: ${backgroundSession.sessionID}`,
            `Agent: ${backgroundSession.agent}`,
          ].join("\n"),
        }
      }
      if (backgroundSession.status === "cancelled") {
        return { output: `Task was cancelled.\nTask ID: ${taskID}` }
      }
      if (backgroundSession.status === "failed") {
        return {
          output: `Task failed.\nTask ID: ${taskID}\nError: ${backgroundSession.error ?? "unknown"}`,
        }
      }
      return {
        output: backgroundSession.result ?? `Task completed.\nTask ID: ${taskID}`,
      }
    }

    const task = this.runtime.getTask(taskID)
    if (!task) return { output: `Task not found: ${taskID}` }
    if (task.status === "running") return { output: `Task is still running.\nTask ID: ${task.id}` }
    if (task.status === "cancelled") return { output: `Task was cancelled.\nTask ID: ${task.id}` }
    if (task.status === "failed") return { output: `Task failed.\nTask ID: ${task.id}\nError: ${task.error ?? "unknown"}` }
    return { output: task.result ?? `Task completed.\nTask ID: ${task.id}` }
  }

  async cancelBackgroundTask(taskID: string): Promise<BackgroundResult> {
    const backgroundSession = this.backgroundSessions.get(taskID)
    if (backgroundSession) {
      backgroundSession.status = "cancelled"
      this.runtime.cancelTask(taskID)
      return {
        output: [
          `Task cancelled.`,
          `Task ID: ${taskID}`,
          `Session ID: ${backgroundSession.sessionID}`,
        ].join("\n"),
      }
    }

    const task = this.runtime.cancelTask(taskID)
    if (!task) return { output: `Task not found: ${taskID}` }
    return { output: `Task cancelled.\nTask ID: ${task.id}` }
  }
}
