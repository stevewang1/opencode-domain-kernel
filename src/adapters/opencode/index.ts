import { tool, type Hooks, type PluginInput } from "@opencode-ai/plugin"
import { createExecutionStrategy } from "../../core/strategies/index.js"
import type { ExecutionOptions, RuntimeSessionClient } from "../../core/strategy.js"
import type { DomainProfile } from "../../core/types.js"
import { loadPluginConfig, getProfileConfig, type DomainKernelConfig } from "../../plugin-config.js"

function isRuntimeSessionClient(value: unknown): value is RuntimeSessionClient {
  if (!value || typeof value !== "object") return false
  const session = (value as { session?: Record<string, unknown> }).session
  if (!session || typeof session !== "object") return false
  const hasCreate = typeof session.create === "function"
  const hasMessages = typeof session.messages === "function"
  const hasPromptAsync = typeof session.promptAsync === "function"
  const hasPrompt = typeof session.prompt === "function"
  return hasCreate && hasMessages && (hasPromptAsync || hasPrompt)
}

function resolveRuntimeClient(ctx: PluginInput, execution?: ExecutionOptions): RuntimeSessionClient | undefined {
  if (isRuntimeSessionClient(execution?.runtimeClient)) return execution.runtimeClient
  if (isRuntimeSessionClient(ctx.client)) return ctx.client
  return undefined
}

function mergeAgentsConfig(
  profile: DomainProfile,
  profileConfig: ReturnType<typeof getProfileConfig>
): Record<string, { model?: string; prompt?: string; temperature?: number; skills?: string[] }> {
  const agents: Record<string, { model?: string; prompt?: string; temperature?: number; skills?: string[] }> = {}

  // Chief
  agents.chief = {
    model: profileConfig?.agents?.chief?.model ?? profile.agents.chief?.model,
    prompt: profile.prompts.chief,
    skills: profileConfig?.agents?.chief?.skills,
  }

  // Deputy
  agents.deputy = {
    model: profileConfig?.agents?.deputy?.model ?? profile.agents.deputy?.model,
    prompt: profile.prompts.deputy,
    temperature: profileConfig?.agents?.deputy?.temperature ?? profile.agents.deputy?.temperature,
    skills: profileConfig?.agents?.deputy?.skills,
  }

  // Explore
  if (profileConfig?.agents?.explore?.model) {
    agents.explore = {
      model: profileConfig.agents.explore.model,
      skills: profileConfig.agents.explore.skills,
    }
  }

  // General
  if (profileConfig?.agents?.general?.model) {
    agents.general = {
      model: profileConfig.agents.general.model,
      skills: profileConfig.agents.general.skills,
    }
  }

  // Other agents
  const otherAgents = ["researcher", "writer", "editor", "fact-checker", "archivist", "extractor"] as const
  for (const agentName of otherAgents) {
    const agentConfig = profileConfig?.agents?.[agentName]
    if (agentConfig?.model) {
      agents[agentName] = {
        model: agentConfig.model,
        temperature: agentConfig.temperature,
        skills: agentConfig.skills,
      }
    }
  }

  return agents
}

export function createOpenCodeAdapter(
  _ctx: PluginInput,
  profile: DomainProfile,
  disabledHooks: string[],
  execution?: ExecutionOptions
): Hooks {
  const userConfig = loadPluginConfig(_ctx.directory ?? process.cwd())
  const profileName = userConfig.defaultProfile || "content"
  const profileConfig = getProfileConfig(userConfig, profileName)
  const agents = mergeAgentsConfig(profile, profileConfig)

  const strategy = createExecutionStrategy(profile, {
    ...execution,
    runtimeClient: resolveRuntimeClient(_ctx, execution),
    timeout: profileConfig?.execution?.timeout ?? userConfig.execution?.timeout,
  })

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
      const runtimeContext = context as { sessionID?: string }
      const result = await strategy.executeChiefTask({
        description: args.description,
        prompt: args.prompt,
        subagentType: targetAgent,
        runInBackground: args.run_in_background,
        sessionID: runtimeContext.sessionID,
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
      ...agents,
    }
    current.default_agent = "chief"
  }

  const afterHook: Hooks["tool.execute.after"] = async (input, output) => {
    if (disabledSet.has("chief-orchestrator")) return
    if (input.tool !== "chief_task") return
    const qualityDims = (profileConfig?.quality?.dimensions ?? profile.quality.dimensions).join(", ")
    const passThreshold = profileConfig?.quality?.passThreshold ?? profile.quality.passThreshold
    const rendered = [
      "Profile: " + profileName,
      "Summary Format: " + profile.artifacts.summaryFormat,
      "Quality Dimensions: " + qualityDims,
      "Pass Threshold: " + passThreshold,
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
