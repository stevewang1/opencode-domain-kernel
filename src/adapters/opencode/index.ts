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

const CHIEF_BLOCKED_WEB_SEARCH_TOOLS = new Set([
  "search",
  "web_search",
  "search_engine",
  "news_search",
  "tavily_search",
  "tavily_extract",
  "tavily_crawl",
  "mcp_tavily_tavily_search",
  "mcp_tavily_tavily_extract",
  "mcp_tavily_tavily_crawl",
])

function isChiefBlockedWebSearchTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase()
  if (CHIEF_BLOCKED_WEB_SEARCH_TOOLS.has(normalized)) return true
  if (normalized.includes("tavily")) return true
  if (normalized.includes("web") && normalized.includes("search")) return true
  if (normalized.includes("news") && normalized.includes("search")) return true
  if (normalized.includes("search_engine")) return true
  return false
}

function buildMcpDenyRules(allowedMcps: string[] | undefined, allMcpServers: string[]): Record<string, "allow" | "deny" | "ask"> {
  if (!allowedMcps) return {}
  const rules: Record<string, "allow" | "deny" | "ask"> = {}
  for (const server of allMcpServers) {
    if (!allowedMcps.includes(server)) rules[server + "_*"] = "deny"
  }
  return rules
}

function normalizeNameList(values: string[] | undefined): string[] | undefined {
  if (!values) return undefined
  const normalized = Array.from(
    new Set(
      values
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  )
  return normalized
}

function normalizePermissionRules(
  permission: Record<string, "allow" | "deny" | "ask"> | undefined
): Record<string, "allow" | "deny" | "ask"> {
  if (!permission) return {}
  const next = { ...permission }
  if (next.edit && !next["edit_*"]) {
    next["edit_*"] = next.edit
    delete next.edit
  }
  if (next.task && !next.chief_task) {
    next.chief_task = next.task
    delete next.task
  }
  return next
}

function resolveExecutionStrategy(
  profileConfig: ReturnType<typeof getProfileConfig>,
  userConfig: DomainKernelConfig
): DomainProfile["execution"]["strategy"] | undefined {
  const configuredStrategy = profileConfig?.execution?.strategy ?? userConfig.execution?.strategy
  if (!configuredStrategy) return undefined
  if (configuredStrategy === "builtin-legacy-bridge") return "runtime"
  return configuredStrategy
}

function injectSkillScope(agentName: string, prompt: string, skills: string[] | undefined): string {
  if (!skills) return prompt
  const listText = skills.length > 0 ? skills.join(", ") : "(none)"
  return prompt + '\n\n<SKILL_SCOPE>\nAgent: ' + agentName + '\nAllowed skills: ' + listText + '\nWhen users ask which skills you have, answer ONLY with this list.\nDo not claim access to skills outside this list.\n</SKILL_SCOPE>'
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

  if (modelLower.includes("kimi") || modelLower.includes("moonshot")) {
    prompt += '\n\n<CRITICAL_MODEL_INSTRUCTION>\n' +
              'When you are chief, your first substantive action must be delegation via chief_task for execution work (including web/news search).\n' +
              'Never claim that you already searched anything unless there is explicit tool evidence from delegated tasks.\n' +
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
): Record<string, { model?: string; prompt?: string; temperature?: number; mode?: "subagent" | "primary" | "all"; hidden?: boolean; skills?: string[]; mcp?: string[]; permission?: Record<string, "allow"|"deny"|"ask"> }> {
  const agents: Record<string, { model?: string; prompt?: string; temperature?: number; mode?: "subagent" | "primary" | "all"; hidden?: boolean; skills?: string[]; mcp?: string[]; permission?: Record<string, "allow"|"deny"|"ask"> }> = {}

  const dimensions = profileConfig?.quality?.dimensions ?? profile.quality.dimensions
  const threshold = profileConfig?.quality?.passThreshold ?? profile.quality.passThreshold
  const scoringPrompt = buildScoringPrompt(dimensions, threshold)

  const defaultChiefPerms = {
    "bash": "deny" as const,
    "edit_*": "deny" as const,
    "search": "deny" as const,
    "web_search": "deny" as const,
    "search_engine": "deny" as const,
    "news_search": "deny" as const,
    "tavily_search": "deny" as const,
    "tavily_extract": "deny" as const,
    "tavily_crawl": "deny" as const,
    "mcp_tavily_*": "deny" as const,
    "mcp_Tavily_*": "deny" as const,
  }

  const defaultSubagentPerms = {
    "chief_task": "deny" as const,
  }

  const chiefSkills = normalizeNameList(profileConfig?.agents?.chief?.skills)
  const chiefMcp = normalizeNameList(profileConfig?.agents?.chief?.mcp)
  agents.chief = {
    model: profileConfig?.agents?.chief?.model ?? profile.agents.chief?.model,
    mode: profileConfig?.agents?.chief?.mode,
    prompt: injectSkillScope(
      "chief",
      injectModelPersona("chief", profileConfig?.agents?.chief?.model ?? profile.agents.chief?.model, profile.prompts.chief, profileConfig?.agents?.chief?.description),
      chiefSkills
    ),
    skills: chiefSkills,
    mcp: chiefMcp,
    permission: { ...defaultChiefPerms, ...(profileConfig?.agents?.chief?.permission || {}) }
  }

  const deputySkills = normalizeNameList(profileConfig?.agents?.deputy?.skills)
  const deputyMcp = normalizeNameList(profileConfig?.agents?.deputy?.mcp)
  agents.deputy = {
    model: profileConfig?.agents?.deputy?.model ?? profile.agents.deputy?.model,
    mode: profileConfig?.agents?.deputy?.mode,
    prompt: injectSkillScope(
      "deputy",
      injectModelPersona("deputy", profileConfig?.agents?.deputy?.model ?? profile.agents.deputy?.model, profile.prompts.deputy + scoringPrompt, profileConfig?.agents?.deputy?.description),
      deputySkills
    ),
    temperature: profileConfig?.agents?.deputy?.temperature ?? profile.agents.deputy?.temperature,
    skills: deputySkills,
    mcp: deputyMcp,
    permission: { ...defaultSubagentPerms, ...(profileConfig?.agents?.deputy?.permission || {}) }
  }

  if (profileConfig?.agents?.explore?.model) {
    const exploreSkills = normalizeNameList(profileConfig.agents.explore.skills)
    const exploreMcp = normalizeNameList(profileConfig.agents.explore.mcp)
    agents.explore = {
      model: profileConfig.agents.explore.model,
      mode: profileConfig.agents.explore.mode ?? "all",
      hidden: false,
      prompt: injectSkillScope(
        "explore",
        injectModelPersona("explore", profileConfig.agents.explore.model, "You are a code explorer." + scoringPrompt, profileConfig.agents.explore.description),
        exploreSkills
      ),
      skills: exploreSkills,
      mcp: exploreMcp,
      permission: { ...defaultSubagentPerms, ...(profileConfig.agents.explore.permission || {}) }
    }
  }

  if (profileConfig?.agents?.general?.model) {
    const generalSkills = normalizeNameList(profileConfig.agents.general.skills)
    const generalMcp = normalizeNameList(profileConfig.agents.general.mcp)
    agents.general = {
      model: profileConfig.agents.general.model,
      mode: profileConfig.agents.general.mode ?? "all",
      hidden: false,
      prompt: injectSkillScope(
        "general",
        injectModelPersona("general", profileConfig.agents.general.model, "You are a general purpose assistant." + scoringPrompt, profileConfig.agents.general.description),
        generalSkills
      ),
      skills: generalSkills,
      mcp: generalMcp,
      permission: { ...defaultSubagentPerms, ...(profileConfig.agents.general.permission || {}) }
    }
  }

  const otherAgents = ["researcher", "writer", "editor", "fact-checker", "archivist", "extractor"] as const
  for (const agentName of otherAgents) {
    const agentConfig = profileConfig?.agents?.[agentName]
    if (agentConfig?.model) {
      const agentSkills = normalizeNameList(agentConfig.skills)
      const agentMcp = normalizeNameList(agentConfig.mcp)
      agents[agentName] = {
        model: agentConfig.model,
        mode: agentConfig.mode,
        prompt: injectSkillScope(
          agentName,
          injectModelPersona(agentName, agentConfig.model, "You are a " + agentName + "." + scoringPrompt, agentConfig.description),
          agentSkills
        ),
        temperature: agentConfig.temperature,
        skills: agentSkills,
        mcp: agentMcp,
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
  const profileName = profile.name
  const resolveActiveProfileConfig = () => {
    const userConfig = loadPluginConfig(_ctx.directory ?? process.cwd())
    const configuredDefaultProfile = userConfig.defaultProfile || "content"
    const profileConfig = getProfileConfig(userConfig, profileName)
      ?? getProfileConfig(userConfig, configuredDefaultProfile)
    const effectiveProfile = {
      ...profile,
      execution: {
        ...profile.execution,
        strategy: resolveExecutionStrategy(profileConfig, userConfig) ?? profile.execution.strategy,
      },
    } satisfies DomainProfile
    const agents = mergeAgentsConfig(effectiveProfile, profileConfig)
    return {
      userConfig,
      profileConfig,
      effectiveProfile,
      agents,
    }
  }

  const initialConfigState = resolveActiveProfileConfig()
  const { userConfig, profileConfig, effectiveProfile } = initialConfigState

  const strategy = createExecutionStrategy(effectiveProfile, {
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
      const { agents } = resolveActiveProfileConfig()
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
  let profileLogged = false
  let profileToastShown = false
  const isPrintLogsMode = process.argv.includes("--print-logs")
  const sessionAgentCache = new Map<string, string>()

  const profileMessage = "[domain-kernel] active profile: " + profileName + " (cwd: " + (_ctx.directory ?? process.cwd()) + ")"

  const emitProfileLog = () => {
    if (profileLogged) return
    profileLogged = true
    console.log(profileMessage)
  }

  const emitProfileToast = () => {
    if (isPrintLogsMode) return
    if (profileToastShown) return
    profileToastShown = true
    setTimeout(() => {
      void _ctx.client.tui.showToast({
        body: {
          message: profileMessage,
          variant: "info",
          duration: 5000,
        },
      }).catch(() => {
        void _ctx.client.tui.publish({
          body: {
            type: "tui.toast.show",
            properties: {
              message: profileMessage,
              variant: "info",
              duration: 5000,
            },
          },
        }).catch((error) => {
          profileToastShown = false
          console.log("[domain-kernel] tui notification failed", error)
        })
      })
    }, 300)
  }

  const configHook: Hooks["config"] = async (config) => {
    const { agents } = resolveActiveProfileConfig()
    const current = config as Record<string, unknown>
    const currentAgents = (current.agent as Record<string, unknown> | undefined) ?? {}
    const allMcpServers = current.mcp ? Object.keys(current.mcp as object) : []
    const finalAgents: Record<string, unknown> = { ...currentAgents }

    for (const [name, cfg] of Object.entries(agents)) {
      const baseAgent = (finalAgents[name] as Record<string, unknown> | undefined) ?? {}
      const mcpDenyRules = buildMcpDenyRules(cfg.mcp, allMcpServers)
      const configuredPermission = normalizePermissionRules(cfg.permission)
      
      const newPermission = {
        ...((baseAgent.permission as Record<string, unknown> | undefined) ?? {}),
        ...mcpDenyRules,
        ...configuredPermission,
      }
      
      const { mcp: _mcp, skills: _skills, permission: _perm, ...agentCore } = cfg
      finalAgents[name] = {
        ...baseAgent,
        ...agentCore,
        skills: cfg.skills ?? (baseAgent.skills as string[] | undefined),
        permission: Object.keys(newPermission).length > 0 ? newPermission : undefined,
      }
    }

    current.agent = finalAgents
    current.default_agent = "chief"
    emitProfileLog()
    emitProfileToast()
  }


  const afterHook: Hooks["tool.execute.after"] = async (input, output) => {
    if (disabledSet.has("chief-orchestrator")) return
    if (input.tool !== "chief_task") return
    const { profileConfig } = resolveActiveProfileConfig()
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
    emitProfileLog()
    emitProfileToast()
  }

  const beforeHook: Hooks["tool.execute.before"] = async (
    input,
    output
  ) => {
    if (!input.sessionID) return
    if (input.tool === "chief_task" || input.tool === "background_output" || input.tool === "background_cancel") {
      return
    }
    if (!isChiefBlockedWebSearchTool(input.tool)) return

    const cachedAgent = sessionAgentCache.get(input.sessionID)
    let callerAgent = cachedAgent
    if (!callerAgent) {
      try {
        const sessionClient = (_ctx.client as unknown as { session?: { get?: (args: { path: { id: string } }) => Promise<unknown> } }).session
        const response = await sessionClient?.get?.({ path: { id: input.sessionID } })
        const data = (response as { data?: { agent?: string } } | undefined)?.data
        if (typeof data?.agent === "string" && data.agent.length > 0) {
          callerAgent = data.agent.toLowerCase()
          sessionAgentCache.set(input.sessionID, callerAgent)
        }
      } catch {}
    }

    if (callerAgent !== "chief") return

    const mutableOutput = output as { args: Record<string, unknown>; message?: string }
    mutableOutput.message = [
      mutableOutput.message ?? "",
      "[domain-kernel] Chief is orchestration-only for web/news requests. Delegate via chief_task to a specialist (for example: subagent_type=\"researcher\").",
    ].filter(Boolean).join("\n")
  }

  const eventHook: Hooks["event"] = async (input) => {
    if (
      input.event.type === "server.connected"
      || input.event.type === "session.created"
      || input.event.type === "session.updated"
    ) {
      emitProfileLog()
      emitProfileToast()
    }
    if (input.event.type === "session.updated" || input.event.type === "session.created") {
      const eventProps = input.event.properties as { info?: { id?: string; agent?: string } } | undefined
      const sessionID = eventProps?.info?.id
      const agentName = eventProps?.info?.agent
      if (sessionID && typeof agentName === "string" && agentName.length > 0) {
        sessionAgentCache.set(sessionID, agentName.toLowerCase())
      }
    }
    if (input.event.type === "session.deleted") {
      const eventProps = input.event.properties as { info?: { id?: string } } | undefined
      const sessionID = eventProps?.info?.id
      if (sessionID) {
        sessionAgentCache.delete(sessionID)
      }
    }
  }

  return {
    event: eventHook,
    config: configHook,
    tool: {
      chief_task: chiefTask,
      background_output: backgroundOutput,
      background_cancel: backgroundCancel,
    },
    "tool.execute.before": beforeHook,
    "tool.execute.after": afterHook,
  }
}
