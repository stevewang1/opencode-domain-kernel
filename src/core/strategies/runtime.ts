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

type WaitDiagnostics = {
  polls: number
  seenSession: boolean
  lastStatus: string
  lastRaw: string
}

export class RuntimeExecutionStrategy implements TaskExecutionStrategy {
  private readonly backgroundSessions = new Map<string, BackgroundSessionTask>()

  constructor(
    private readonly runtime: KernelRuntime,
    private readonly profile: DomainProfile,
    private readonly client?: RuntimeSessionClient
  ) {}

  private describeClientCapabilities(): string {
    const session = this.client?.session as Record<string, unknown> | undefined
    const hasClient = Boolean(this.client)
    const hasSession = Boolean(session)
    const hasCreate = typeof session?.create === "function"
    const hasMessages = typeof session?.messages === "function"
    const hasPromptAsync = typeof session?.promptAsync === "function"
    const hasPrompt = typeof session?.prompt === "function"
    const hasStatus = typeof session?.status === "function"
    return `client=${hasClient}, session=${hasSession}, create=${hasCreate}, messages=${hasMessages}, promptAsync=${hasPromptAsync}, prompt=${hasPrompt}, status=${hasStatus}`
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, ms))
  }

  private preview(value: unknown): string {
    try {
      const text = JSON.stringify(value)
      return typeof text === "string" ? text.slice(0, 1200) : String(value)
    } catch {
      return String(value)
    }
  }

  private isDebugEnabled(): boolean {
    const runtime = globalThis as { process?: { env?: Record<string, string | undefined> } }
    return runtime.process?.env?.OPENCODE_KERNEL_DEBUG === "1"
  }

  private parseStatusEntry(value: unknown): { type?: string; next?: number } | undefined {
    if (!value || typeof value !== "object") return undefined
    const source = value as { status?: unknown; type?: unknown; next?: unknown }
    const status = source.status && typeof source.status === "object" ? (source.status as { type?: unknown; next?: unknown }) : source
    return {
      type: typeof status.type === "string" ? status.type : undefined,
      next: typeof status.next === "number" ? status.next : undefined,
    }
  }

  private extractStatusMap(response: unknown): Record<string, { type?: string; next?: number }> {
    const raw = (response as { data?: unknown } | undefined)?.data ?? response
    if (!raw) return {}
    if (Array.isArray(raw)) {
      const mapped = raw.reduce<Record<string, { type?: string; next?: number }>>((acc, item) => {
        if (!item || typeof item !== "object") return acc
        const record = item as { sessionID?: unknown; id?: unknown }
        const sessionID = typeof record.sessionID === "string" ? record.sessionID : typeof record.id === "string" ? record.id : undefined
        if (!sessionID) return acc
        const entry = this.parseStatusEntry(item)
        if (entry) acc[sessionID] = entry
        return acc
      }, {})
      return mapped
    }
    if (typeof raw !== "object") return {}
    const entries = Object.entries(raw as Record<string, unknown>)
    const mapped: Record<string, { type?: string; next?: number }> = {}
    for (const [key, value] of entries) {
      const entry = this.parseStatusEntry(value)
      if (entry) mapped[key] = entry
    }
    return mapped
  }

  private async waitForSessionIdle(sessionID: string): Promise<WaitDiagnostics> {
    const diagnostics: WaitDiagnostics = {
      polls: 0,
      seenSession: false,
      lastStatus: "unknown",
      lastRaw: "",
    }
    const session = this.client?.session
    if (!session || typeof session.status !== "function") {
      await this.sleep(800)
      diagnostics.lastStatus = "status_unavailable"
      return diagnostics
    }

    const timeoutAt = Date.now() + 600000
    let missingCount = 0
    while (Date.now() < timeoutAt) {
      diagnostics.polls += 1
      const response = await session.status({} as unknown).catch(() => undefined)
      const statusMap = this.extractStatusMap(response)
      const current = statusMap[sessionID]
      diagnostics.lastRaw = this.preview(response)
      if (!current) {
        diagnostics.lastStatus = "missing"
        missingCount += 1
        if (this.isDebugEnabled()) {
          console.log(`[kernel.wait] session=${sessionID} response=${diagnostics.lastRaw} current=missing`)
        }
        if (missingCount >= 6) {
          await this.sleep(1200)
          return diagnostics
        }
        await this.sleep(500)
        continue
      }
      diagnostics.seenSession = true
      diagnostics.lastStatus = current.type ?? "unknown"
      if (this.isDebugEnabled()) {
        console.log(`[kernel.wait] session=${sessionID} response=${diagnostics.lastRaw} current=${this.preview(current)}`)
      }
      if (current.type === "idle") return diagnostics
      const wait = current.type === "retry" && typeof current.next === "number" ? (current.next > 1000000000000 ? Math.max(500, Math.min(current.next - Date.now(), 5000)) : Math.max(300, current.next)) : 500
      await this.sleep(wait)
    }
    diagnostics.lastStatus = `${diagnostics.lastStatus}|timeout`
    return diagnostics
  }

  private async sendPrompt(input: unknown): Promise<void> {
    const session = this.client?.session
    if (session && typeof session.promptAsync === "function") {
      await session.promptAsync(input)
      return
    }
    if (session && typeof session.prompt === "function") {
      await session.prompt(input)
      return
    }
    throw new Error(`Runtime client unavailable for prompt dispatch. ${this.describeClientCapabilities()}`)
  }

  private async getLatestAssistantText(sessionID: string): Promise<string> {
    if (!this.client) return ""
    const response = await this.client.session.messages({
      path: { id: sessionID },
    } as unknown)
    const raw = (response as { data?: unknown } | undefined)?.data ?? response
    const messages = Array.isArray(raw) ? raw : []
    const assistant = [...messages].reverse().find((m) => {
      const role = (m as { info?: { role?: string }; role?: string }).info?.role ?? (m as { role?: string }).role
      return role === "assistant"
    }) as { parts?: Array<{ type?: string; text?: string }> } | undefined
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

          this.sendPrompt(promptBody)
            .then(async () => {
              const waitDiagnostics = await this.waitForSessionIdle(sessionID)
              const output = await this.getLatestAssistantText(sessionID)
              const current = this.backgroundSessions.get(task.id)
              if (!current || current.status === "cancelled") return
              current.status = "completed"
              current.result =
                output ||
                [
                  `Task completed.`,
                  `Session ID: ${sessionID}`,
                  `Wait: polls=${waitDiagnostics.polls}, seenSession=${waitDiagnostics.seenSession}, lastStatus=${waitDiagnostics.lastStatus}`,
                  `StatusRaw: ${waitDiagnostics.lastRaw || "n/a"}`,
                ].join("\n")
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
          await this.sendPrompt(promptBody)
          const waitDiagnostics = await this.waitForSessionIdle(sessionID)
          const output = await this.getLatestAssistantText(sessionID)
          const result = [
            `Profile: ${this.profile.name}`,
            `Agent: ${input.subagentType}`,
            `Mode: direct`,
            `Session ID: ${sessionID}`,
            "",
            output ||
              [
                `(No text output)`,
                `Wait: polls=${waitDiagnostics.polls}, seenSession=${waitDiagnostics.seenSession}, lastStatus=${waitDiagnostics.lastStatus}`,
                `StatusRaw: ${waitDiagnostics.lastRaw || "n/a"}`,
              ].join("\n"),
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
          this.client ? `Warning: missing sessionID, task not dispatched to subagent.` : `Warning: runtime client unavailable, task not dispatched to subagent.`,
          `Runtime: ${this.describeClientCapabilities()}`,
        ].join("\n"),
        taskID: task.id,
      }
    }

    const result = [
      `Profile: ${this.profile.name}`,
      `Agent: ${input.subagentType}`,
      `Mode: direct`,
      `Task: ${input.prompt}`,
      this.client ? `Warning: missing sessionID, ran fallback output only.` : `Warning: runtime client unavailable, ran fallback output only.`,
      `Runtime: ${this.describeClientCapabilities()}`,
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
