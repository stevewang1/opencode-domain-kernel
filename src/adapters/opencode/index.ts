import { tool, type Hooks, type PluginInput } from "@opencode-ai/plugin"
import { KernelRuntime } from "../../core/runtime.js"
import type { DomainProfile } from "../../core/types.js"

export function createOpenCodeAdapter(
  _ctx: PluginInput,
  profile: DomainProfile,
  disabledHooks: string[]
): Hooks {
  const runtime = new KernelRuntime()
  const agent = {
    chief: {
      model: profile.agents.chief?.model,
      prompt: profile.prompts.chief,
    },
    deputy: {
      model: profile.agents.deputy?.model,
      prompt: profile.prompts.deputy,
      temperature: profile.agents.deputy?.temperature,
    },
  }

  const chiefTask = tool({
    description: "Delegate a task to domain executor agent and optionally run in background.",
    args: {
      subagent_type: tool.schema.string().default(profile.routing.defaultExecutor),
      prompt: tool.schema.string(),
      run_in_background: tool.schema.boolean().default(false),
    },
    async execute(args, context) {
      const targetAgent = args.subagent_type || profile.routing.defaultExecutor
      const task = runtime.createTask({ description: args.prompt, agent: targetAgent })
      if (args.run_in_background) {
        context.metadata({
          title: "Background task launched",
          metadata: { task_id: task.id, profile: profile.name, agent: targetAgent },
        })
        return `Task launched in background.\nTask ID: ${task.id}\nProfile: ${profile.name}\nAgent: ${targetAgent}`
      }

      const result = [
        `Profile: ${profile.name}`,
        `Agent: ${targetAgent}`,
        `Mode: direct`,
        `Task: ${args.prompt}`,
      ].join("\n")

      runtime.completeTask(task.id, result)

      context.metadata({
        title: "Task completed",
        metadata: { task_id: task.id, profile: profile.name, agent: targetAgent },
      })

      return result
    },
  })

  const backgroundOutput = tool({
    description: "Get output from a background task.",
    args: {
      task_id: tool.schema.string(),
    },
    async execute(args) {
      const task = runtime.getTask(args.task_id)
      if (!task) return `Task not found: ${args.task_id}`
      if (task.status === "running") return `Task is still running.\nTask ID: ${task.id}`
      if (task.status === "cancelled") return `Task was cancelled.\nTask ID: ${task.id}`
      if (task.status === "failed") return `Task failed.\nTask ID: ${task.id}\nError: ${task.error ?? "unknown"}`
      return task.result ?? `Task completed.\nTask ID: ${task.id}`
    },
  })

  const backgroundCancel = tool({
    description: "Cancel a running background task.",
    args: {
      task_id: tool.schema.string(),
    },
    async execute(args) {
      const task = runtime.cancelTask(args.task_id)
      if (!task) return `Task not found: ${args.task_id}`
      return `Task cancelled.\nTask ID: ${task.id}`
    },
  })

  const disabledSet = new Set(disabledHooks)

  const configHook: Hooks["config"] = async (config) => {
    const current = config as Record<string, unknown>
    const currentAgents = (current.agent as Record<string, unknown> | undefined) ?? {}
    current.agent = {
      ...currentAgents,
      chief: agent.chief,
      deputy: agent.deputy,
    }
    current.default_agent = "chief"
  }

  const afterHook: Hooks["tool.execute.after"] = async (input, output) => {
    if (disabledSet.has("chief-orchestrator")) return
    if (input.tool !== "chief_task") return
    const rendered = [
      `Summary Format: ${profile.artifacts.summaryFormat}`,
      `Quality Dimensions: ${profile.quality.dimensions.join(", ")}`,
      `Pass Threshold: ${profile.quality.passThreshold}`,
      "",
      output.output,
    ].join("\n")
    output.output = rendered
  }

  return {
    config: configHook,
    tool: {
      chief_task: chiefTask,
      background_output: backgroundOutput,
      background_cancel: backgroundCancel,
    },
    "tool.execute.after": afterHook,
  }
}
