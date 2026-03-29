import sys

with open("src/adapters/opencode/index.ts.bak", "r", encoding="utf-8") as f:
    code = f.read()

# 1. Inject injectModelPersona function
nl = chr(10)

inject_func = "function injectModelPersona(agentName: string, model: string | undefined, basePrompt: string, description?: string): string {" + nl
inject_func += "  let prompt = basePrompt;" + nl
inject_func += "  if (description) {" + nl
inject_func += "    prompt = '<Role_Description>\n' + description + '\n</Role_Description>\n\n' + prompt;" + nl
inject_func += "  }" + nl
inject_func += "  const modelLower = model ? model.toLowerCase() : '';" + nl
inject_func += "  if (modelLower.includes('gemini')) {" + nl
inject_func += "    prompt += '\n\n<CRITICAL_MODEL_INSTRUCTION>\n' +" + nl
inject_func += "              '## YOU MUST USE TOOLS FOR EVERY ACTION. THIS IS NOT OPTIONAL.\n' +" + nl
inject_func += "              '**YOUR FAILURE MODE**: You believe you can reason through file contents, task status, and verification without actually calling tools. You CANNOT. Your internal state about files you \'already know\' is UNRELIABLE.\n' +" + nl
inject_func += "              '1. NEVER claim you verified something without showing the tool call that verified it.\n' +" + nl
inject_func += "              '2. NEVER reason about what a changed file \'probably looks like.\' Call Read on it.\n' +" + nl
inject_func += "              '</CRITICAL_MODEL_INSTRUCTION>';" + nl
inject_func += "  }" + nl
inject_func += "  if (modelLower.includes('glm') || modelLower.includes('qwen') || modelLower.includes('deepseek')) {" + nl
inject_func += "    prompt += '\n\n<CRITICAL_MODEL_INSTRUCTION>\n' +" + nl
inject_func += "              'Strictly adhere to the required output formats and tool schemas. Do NOT output markdown code blocks unless requested. Do NOT hallucinate parameters. Focus only on the requested task.\n' +" + nl
inject_func += "              '</CRITICAL_MODEL_INSTRUCTION>';" + nl
inject_func += "  }" + nl
inject_func += "  if (agentName === 'chief') {" + nl
inject_func += "    prompt += '\n\n<ROLE_ENFORCEMENT>\n' +" + nl
inject_func += "              'CRITICAL RULE: YOU MUST NEVER WRITE CODE, EXECUTE COMMANDS, OR DO THE WORK YOURSELF.\n' +" + nl
inject_func += "              'You are Atlas - Master Orchestrator. Role: Conductor, not musician. General, not soldier.\n' +" + nl
inject_func += "              'You DELEGATE, COORDINATE, and VERIFY. Your ONLY job is to break down the request, create a plan using todowrite, and delegate EVERY single implementation step to subagents using \'chief_task\'.\n' +" + nl
inject_func += "              'When subagents return, you MUST verify their work. Remember: Subagents lie, always verify using read or lsp tools.\n' +" + nl
inject_func += "              '</ROLE_ENFORCEMENT>';" + nl
inject_func += "  } else if (agentName === 'deputy' || agentName === 'general' || agentName === 'explore' || agentName === 'researcher') {" + nl
inject_func += "    prompt += '\n\n<ROLE_ENFORCEMENT>\n' +" + nl
inject_func += "              'You are an IMPLEMENTER. You DO NOT delegate tasks. You use your available tools to complete the work assigned to you directly and completely. You NEVER use \'chief_task\'.\n' +" + nl
inject_func += "              '</ROLE_ENFORCEMENT>';" + nl
inject_func += "  }" + nl
inject_func += "  return prompt;" + nl
inject_func += "}" + nl + nl
inject_func += "function mergeAgentsConfig"

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

with open("src/adapters/opencode/index.ts", "w", encoding="utf-8") as f:
    f.write(code)

print("Patch safe Python Script Finished!")
