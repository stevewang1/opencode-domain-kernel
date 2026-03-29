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

function injectModelPersona(agentName: string, model: string | undefined, basePrompt: string, description?: string): string {
  let prompt = basePrompt;
  if (description) {
    prompt = '<Role_Description>\n' + description + '\n</Role_Description>\n\n' + prompt;
  }
  const modelLower = model ? model.toLowerCase() : '';

  if (modelLower.includes('gemini')) {
    prompt += '\n\n<CRITICAL_MODEL_INSTRUCTION>\n' +
              '## YOU MUST USE TOOLS FOR EVERY ACTION. THIS IS NOT OPTIONAL.\n' +
              '**YOUR FAILURE MODE**: You believe you can reason through file contents, task status, and verification without actually calling tools. You CANNOT. Your internal state about files you \'already know\' is UNRELIABLE.\n' +
              '1. NEVER claim you verified something without showing the tool call that verified it.\n' +
              '2. NEVER reason about what a changed file \'probably looks like.\' Call Read on it.\n' +
              '</CRITICAL_MODEL_INSTRUCTION>';
  }
  
  if (modelLower.includes('glm') || modelLower.includes('qwen') || modelLower.includes('deepseek')) {
    prompt += '\n\n<CRITICAL_MODEL_INSTRUCTION>\n' +
              'Strictly adhere to the required output formats and tool schemas. Do NOT output markdown code blocks unless requested. Do NOT hallucinate parameters. Focus only on the requested task.\n' +
              '</CRITICAL_MODEL_INSTRUCTION>';
  }

  if (agentName === 'chief') {
    prompt += '\n\n<ROLE_ENFORCEMENT>\n' +
              'CRITICAL RULE: YOU MUST NEVER WRITE CODE, EXECUTE COMMANDS, OR DO THE WORK YOURSELF.\n' +
              'You are Atlas - Master Orchestrator. Role: Conductor, not musician. General, not soldier.\n' +
              'You DELEGATE, COORDINATE, and VERIFY. Your ONLY job is to break down the request, create a plan using todowrite, and delegate EVERY single implementation step to subagents using \'chief_task\'.\n' +
              'When subagents return, you MUST verify their work. Remember: Subagents lie, always verify using read or lsp tools.\n' +
              '</ROLE_ENFORCEMENT>';
  } else if (agentName === 'deputy' || agentName === 'general' || agentName === 'explore' || agentName === 'researcher') {
    prompt += '\n\n<ROLE_ENFORCEMENT>\n' +
              'You are an IMPLEMENTER. You DO NOT delegate tasks. You use your available tools to complete the work assigned to you directly and completely. You NEVER use \'chief_task\'.\n' +
              '</ROLE_ENFORCEMENT>';
  }
  return prompt;
}

function mergeAgentsConfig(
  profile: DomainProfile,
  profileConfig: ReturnType<typeof getProfileConfig>
): Record<string, { model?: string; prompt?: string; temperature?: number; skills?: string[]; mcp?: string[]; permission?: Record<string, "allow"|"deny"|"ask"> }> {
  const agents: Record<string, { model?: string; prompt?: string; temperature?: number; skills?: string[]; mcp?: string[]; permission?: Record<string, "allow"|"deny"|"ask"> }> = {}

  const dimensions = profileConfig?.quality?.dimensions ?? profile.quality.dimensions
  const threshold = profileConfig?.quality?.passThreshold ?? profile.quality.passThreshold
  const scoringPrompt = buildScoringPrompt(dimensions, threshold)

  const defaultChiefPerms = {
    "bash": "deny" as const,
    "edit_*": "deny" as const,
  }

  const defaultSubagentPerms = {
    "chief_task": "deny" as const,
  }

  agents.chief = {
    model: profileConfig?.agents?.chief?.model ?? profile.agents.chief?.model,
    prompt: injectModelPersona("chief", profileConfig?.agents?.chief?.model ?? profile.agents.chief?.model, profile.prompts.chief, profileConfig?.agents?.chief?.description),
    skills: profileConfig?.agents?.chief?.skills,
    mcp: profileConfig?.agents?.chief?.mcp,
    permission: { ...defaultChiefPerms, ...(profileConfig?.agents?.chief?.permission || {}) }
  }

  agents.deputy = {
    model: profileConfig?.agents?.deputy?.model ?? profile.agents.deputy?.model,
    prompt: injectModelPersona("deputy", profileConfig?.agents?.deputy?.model ?? profile.agents.deputy?.model, profile.prompts.deputy + scoringPrompt, profileConfig?.agents?.deputy?.description),
    temperature: profileConfig?.agents?.deputy?.temperature ?? profile.agents.deputy?.temperature,
    skills: profileConfig?.agents?.deputy?.skills,
    mcp: profileConfig?.agents?.deputy?.mcp,
    permission: { ...defaultSubagentPerms, ...(profileConfig?.agents?.deputy?.permission || {}) }
  }

  if (profileConfig?.agents?.explore?.model) {
    agents.explore = {
      model: profileConfig.agents.explore.model,
      prompt: injectModelPersona("explore", profileConfig.agents.explore.model, "You are a code explorer." + scoringPrompt, profileConfig.agents.explore.description),
      skills: profileConfig.agents.explore.skills,
      mcp: profileConfig.agents.explore.mcp,
      permission: { ...defaultSubagentPerms, ...(profileConfig.agents.explore.permission || {}) }
    }
  }

  if (profileConfig?.agents?.general?.model) {
    agents.general = {
      model: profileConfig.agents.general.model,
      prompt: injectModelPersona("general", profileConfig.agents.general.model, "You are a general purpose assistant." + scoringPrompt, profileConfig.agents.general.description),
      skills: profileConfig.agents.general.skills,
      mcp: profileConfig.agents.general.mcp,
      permission: { ...defaultSubagentPerms, ...(profileConfig.agents.general.permission || {}) }
    }
  }

  const otherAgents = ["researcher", "writer", "editor", "fact-checker", "archivist", "extractor"] as const
  for (const agentName of otherAgents) {
    const agentConfig = profileConfig?.agents?.[agentName]
    if (agentConfig?.model) {
      agents[agentName] = {
        model: agentConfig.model,
        prompt: injectModelPersona(agentName, agentConfig.model, "You are a " + agentName + "." + scoringPrompt, agentConfig.description),
        temperature: agentConfig.temperature,
        skills: agentConfig.skills,
        mcp: agentConfig.mcp,
        permission: { ...defaultSubagentPerms, ...(agentConfig.permission || {}) }
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
      const configuredPermission = cfg.permission ?? {}
      
      const newPermission = {
        ...((baseAgent.permission as Record<string, unknown> | undefined) ?? {}),
        ...mcpDenyRules,
        ...configuredPermission,
      }
      
      const { mcp: _mcp, skills: _skills, permission: _perm, ...agentCore } = cfg
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
