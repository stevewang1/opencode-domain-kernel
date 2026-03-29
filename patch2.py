import sys

with open("E:/project/opencode-domain-kernel/src/adapters/opencode/index.ts.bak", "r", encoding="utf-8") as f:
    code = f.read()

inject_func = r"""function injectModelPersona(agentName: string, model: string | undefined, basePrompt: string, description?: string): string {
  let prompt = basePrompt;
  if (description) {
    prompt = "<Role_Description>\n" + description + "\n</Role_Description>\n\n" + prompt;
  }
  const modelLower = model ? model.toLowerCase() : "";

  if (modelLower.includes("gemini")) {
    prompt += "\n\n<CRITICAL_MODEL_INSTRUCTION>\n" +
              "## YOU MUST USE TOOLS FOR EVERY ACTION. THIS IS NOT OPTIONAL.\n" +
              "**YOUR FAILURE MODE**: You believe you can reason through file contents, task status, and verification without actually calling tools. You CANNOT. Your internal state about files you 'already know' is UNRELIABLE.\n" +
              "1. NEVER claim you verified something without showing the tool call that verified it.\n" +
              "2. NEVER reason about what a changed file 'probably looks like.' Call Read on it.\n" +
              "</CRITICAL_MODEL_INSTRUCTION>";
  }
  
  if (modelLower.includes("glm") || modelLower.includes("qwen") || modelLower.includes("deepseek")) {
    prompt += "\n\n<CRITICAL_MODEL_INSTRUCTION>\n" +
              "Strictly adhere to the required output formats and tool schemas. Do NOT output markdown code blocks unless requested. Do NOT hallucinate parameters. Focus only on the requested task.\n" +
              "</CRITICAL_MODEL_INSTRUCTION>";
  }

  if (agentName === "chief") {
    prompt += "\n\n<ROLE_ENFORCEMENT>\n" +
              "CRITICAL RULE: YOU MUST NEVER WRITE CODE, EXECUTE COMMANDS, OR DO THE WORK YOURSELF.\n" +
              "You are Atlas - Master Orchestrator. Role: Conductor, not musician. General, not soldier.\n" +
              "You DELEGATE, COORDINATE, and VERIFY. Your ONLY job is to break down the request, create a plan using todowrite, and delegate EVERY single implementation step to subagents using 'chief_task'.\n" +
              "When subagents return, you MUST verify their work. Remember: Subagents lie, always verify using read or lsp tools.\n" +
              "</ROLE_ENFORCEMENT>";
  } else if (agentName === "deputy" || agentName === "general" || agentName === "explore" || agentName === "researcher") {
    prompt += "\n\n<ROLE_ENFORCEMENT>\n" +
              "You are an IMPLEMENTER. You DO NOT delegate tasks. You use your available tools to complete the work assigned to you directly and completely. You NEVER use 'chief_task'.\n" +
              "</ROLE_ENFORCEMENT>";
  }
  return prompt;
}

function mergeAgentsConfig"""

if "injectModelPersona" not in code:
    code = code.replace("function mergeAgentsConfig", inject_func)

code = code.replace(
    'Record<string, { model?: string; prompt?: string; temperature?: number; skills?: string[]; mcp?: string[] }>',
    'Record<string, { model?: string; prompt?: string; temperature?: number; skills?: string[]; mcp?: string[]; permission?: Record<string, "allow"|"deny"|"ask"> }>'
)

code = code.replace(
    '  agents.chief = {',
    '  const defaultChiefPerms = { "bash": "deny" as const, "edit_*": "deny" as const };\n  const defaultSubagentPerms = { "chief_task": "deny" as const };\n\n  agents.chief = {'
)

code = code.replace(
    '    prompt: profile.prompts.chief,',
    '    prompt: injectModelPersona("chief", profileConfig?.agents?.chief?.model ?? profile.agents.chief?.model, profile.prompts.chief, profileConfig?.agents?.chief?.description),'
)
code = code.replace(
    '    mcp: profileConfig?.agents?.chief?.mcp,\n  }',
    '    mcp: profileConfig?.agents?.chief?.mcp,\n    permission: { ...defaultChiefPerms, ...(profileConfig?.agents?.chief?.permission || {}) }\n  }'
)

code = code.replace(
    '    prompt: profile.prompts.deputy + scoringPrompt,',
    '    prompt: injectModelPersona("deputy", profileConfig?.agents?.deputy?.model ?? profile.agents.deputy?.model, profile.prompts.deputy + scoringPrompt, profileConfig?.agents?.deputy?.description),'
)
code = code.replace(
    '    mcp: profileConfig?.agents?.deputy?.mcp,\n  }',
    '    mcp: profileConfig?.agents?.deputy?.mcp,\n    permission: { ...defaultSubagentPerms, ...(profileConfig?.agents?.deputy?.permission || {}) }\n  }'
)

code = code.replace(
    '      prompt: "You are a code explorer." + scoringPrompt,',
    '      prompt: injectModelPersona("explore", profileConfig.agents.explore.model, "You are a code explorer." + scoringPrompt, profileConfig.agents.explore.description),'
)
code = code.replace(
    '      mcp: profileConfig.agents.explore.mcp,\n    }',
    '      mcp: profileConfig.agents.explore.mcp,\n      permission: { ...defaultSubagentPerms, ...(profileConfig.agents.explore.permission || {}) }\n    }'
)

code = code.replace(
    '      prompt: "You are a general purpose assistant." + scoringPrompt,',
    '      prompt: injectModelPersona("general", profileConfig.agents.general.model, "You are a general purpose assistant." + scoringPrompt, profileConfig.agents.general.description),'
)
code = code.replace(
    '      mcp: profileConfig.agents.general.mcp,\n    }',
    '      mcp: profileConfig.agents.general.mcp,\n      permission: { ...defaultSubagentPerms, ...(profileConfig.agents.general.permission || {}) }\n    }'
)

code = code.replace(
    '        prompt: "You are a " + agentName + "." + scoringPrompt,',
    '        prompt: injectModelPersona(agentName, agentConfig.model, "You are a " + agentName + "." + scoringPrompt, agentConfig.description),'
)
code = code.replace(
    '        mcp: agentConfig.mcp,\n      }',
    '        mcp: agentConfig.mcp,\n        permission: { ...defaultSubagentPerms, ...(agentConfig.permission || {}) }\n      }'
)

code = code.replace(
    '      const newPermission = {\n        ...((baseAgent.permission as Record<string, unknown> | undefined) ?? {}),\n        ...mcpDenyRules,\n      }\n      const { mcp: _mcp, skills: _skills, ...agentCore } = cfg',
    '      const configuredPermission = cfg.permission ?? {};\n      const newPermission = {\n        ...((baseAgent.permission as Record<string, unknown> | undefined) ?? {}),\n        ...mcpDenyRules,\n        ...configuredPermission,\n      }\n      const { mcp: _mcp, skills: _skills, permission: _perm, ...agentCore } = cfg'
)

with open("E:/project/opencode-domain-kernel/src/adapters/opencode/index.ts", "w", encoding="utf-8") as f:
    f.write(code)

print("Patch 2 Python Script Finished!")
