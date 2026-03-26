import { tool, type Hooks, type PluginInput } from "@opencode-ai/plugin"
import { createExecutionStrategy } from "../../core/strategies/index.js"
import type { DomainProfile } from "../../core/types.js"

export function createOpenCodeAdapter(
  _ctx: PluginInput,
  profile: DomainProfile,
  disabledHooks: string[]
): Hooks {
  const strategy = createExecutionStrategy(profile)
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
      description: tool.schema.string().default("Delegated task"),
      category: tool.schema.string().optional(),
      subagent_type: tool.schema.string().default(profile.routing.defaultExecutor),
      prompt: tool.schema.string(),
      run_in_background: tool.schema.boolean().default(false),
      resume: tool.schema.string().optional(),
      skills: tool.schema.array(tool.schema.string()).optional(),
    },
    async execute(args, context) {
      const targetAgent = args.subagent_type ?? profile.routing.defaultExecutor
      const result = await strategy.executeChiefTask({
        description: args.description,
        prompt: args.prompt,
        subagentType: targetAgent,
        runInBackground: args.run_in_background,
        category: args.category,
        resume: args.resume,
        skills: args.skills,
      })

      context.metadata({
        title: args.run_in_background ? "Background task launched" : "Task completed",
        metadata: { task_id: result.taskID, profile: profile.name, agent: targetAgent },
      })

      return result.output
    },
  })

  const backgroundOutput = tool({
    description: "Get output from a background task.",
    args: {
      task_id: tool.schema.string(),
    },
    async execute(args) {
      const result = await strategy.getBackgroundOutput(args.task_id)
      return result.output
    },
  })

  const backgroundCancel = tool({
    description: "Cancel a running background task.",
    args: {
      task_id: tool.schema.string(),
    },
    async execute(args) {
      const result = await strategy.cancelBackgroundTask(args.task_id)
      return result.output
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
