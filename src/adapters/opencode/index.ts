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

function buildScoringPrompt(dimensions: string[], threshold: number): string {
  if (!dimensions || dimensions.length === 0) return ""
  
  const dimLines = dimensions.map(dim => "- " + dim + ": <0.00-1.00>").join("\n")

  return "\n\n<Quality_Assessment>\nAfter completing your task, you MUST evaluate your own work against the following quality dimensions.\nYou MUST output this exact block at the very end of your response:\n\n**QUALITY SCORES:**\n" + dimLines + "\n**OVERALL: <0.00-1.00>**\n\nScore guide:\n- 0.90-1.00: Excellent, highly actionable\n- " + threshold + "-0.89: Passing, meets requirements\n- < " + threshold + ": Needs improvement, rework required\n</Quality_Assessment>"
}

function buildMcpDenyRules(allowedMcps: string[] | undefined, allMcpServers: string[]): Record<string, "allow" | "deny" | "ask"> {
  if (!allowedMcps) return {}
  const rules: Record<string, "allow" | "deny" | "ask"> = {}
  for (const server of allMcpServers) {
    if (!allowedMcps.includes(server)) rules[server + "_*"] = "deny"
  }
  return rules
}

function mergeAgentsConfig(
  profile: DomainProfile,
  profileConfig: ReturnType<typeof getProfileConfig>
): Record<string, { model?: string; prompt?: string; temperature?: number; skills?: string[]; mcp?: string[] }> {
  const agents: Record<string, { model?: string; prompt?: string; temperature?: number; skills?: string[]; mcp?: string[] }> = {}

  const dimensions = profileConfig?.quality?.dimensions ?? profile.quality.dimensions
  const threshold = profileConfig?.quality?.passThreshold ?? profile.quality.passThreshold
  const scoringPrompt = buildScoringPrompt(dimensions, threshold)

  agents.chief = {
    model: profileConfig?.agents?.chief?.model ?? profile.agents.chief?.model,
    prompt: profile.prompts.chief,
    skills: profileConfig?.agents?.chief?.skills,
    mcp: profileConfig?.agents?.chief?.mcp,
  }

  agents.deputy = {
    model: profileConfig?.agents?.deputy?.model ?? profile.agents.deputy?.model,
    prompt: profile.prompts.deputy + scoringPrompt,
    temperature: profileConfig?.agents?.deputy?.temperature ?? profile.agents.deputy?.temperature,
    skills: profileConfig?.agents?.deputy?.skills,
    mcp: profileConfig?.agents?.deputy?.mcp,
  }

  if (profileConfig?.agents?.explore?.model) {
    agents.explore = {
      model: profileConfig.agents.explore.model,
      prompt: "You are a code explorer." + scoringPrompt,
      skills: profileConfig.agents.explore.skills,
      mcp: profileConfig.agents.explore.mcp,
    }
  }

  if (profileConfig?.agents?.general?.model) {
    agents.general = {
      model: profileConfig.agents.general.model,
      prompt: "You are a general purpose assistant." + scoringPrompt,
      skills: profileConfig.agents.general.skills,
      mcp: profileConfig.agents.general.mcp,
    }
  }

  const otherAgents = ["researcher", "writer", "editor", "fact-checker", "archivist", "extractor"] as const
  for (const agentName of otherAgents) {
    const agentConfig = profileConfig?.agents?.[agentName]
    if (agentConfig?.model) {
      agents[agentName] = {
        model: agentConfig.model,
        prompt: "You are a " + agentName + "." + scoringPrompt,
        temperature: agentConfig.temperature,
        skills: agentConfig.skills,
        mcp: agentConfig.mcp,
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
      
      const configuredSkills = agents[targetAgent]?.skills || []
      const taskSkills = args.skills || []
      const mergedSkills = [...new Set([...configuredSkills, ...taskSkills])]

      const result = await strategy.executeChiefTask({
        description: args.description,
        prompt: args.prompt,
        subagentType: targetAgent,
        runInBackground: args.run_in_background,
        sessionID: runtimeContext.sessionID,
        category: args.category,
        resume: args.resume,
        skills: mergedSkills,
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
    const allMcpServers = current.mcp ? Object.keys(current.mcp as object) : []
    const finalAgents: Record<string, unknown> = { ...currentAgents }

    for (const [name, cfg] of Object.entries(agents)) {
      const baseAgent = (finalAgents[name] as Record<string, unknown> | undefined) ?? {}
      const mcpDenyRules = buildMcpDenyRules(cfg.mcp, allMcpServers)
      const newPermission = {
        ...((baseAgent.permission as Record<string, unknown> | undefined) ?? {}),
        ...mcpDenyRules,
      }
      const { mcp: _mcp, skills: _skills, ...agentCore } = cfg
      finalAgents[name] = {
        ...baseAgent,
        ...agentCore,
        permission: Object.keys(newPermission).length > 0 ? newPermission : undefined,
      }
    }

    current.agent = finalAgents
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
