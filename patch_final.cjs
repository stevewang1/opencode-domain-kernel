const fs = require('fs');
let code = fs.readFileSync('E:/project/opencode-domain-kernel/src/adapters/opencode/index.ts', 'utf8');

const injectCode = "function injectModelPersona(agentName: string, model: string | undefined, basePrompt: string, description?: string): string {\n" +
"  let prompt = basePrompt;\n" +
"  if (description) prompt = '<Role_Description>\n' + description + '\n</Role_Description>\n\n' + prompt;\n" +
"  const modelLower = model ? model.toLowerCase() : '';\n" +
"  if (modelLower.includes('gemini')) {\n" +
"    prompt += '\n\n<CRITICAL_MODEL_INSTRUCTION>\n## YOU MUST USE TOOLS FOR EVERY ACTION.\n**YOUR FAILURE MODE**: You believe you can reason without tools. You CANNOT.\n1. NEVER claim you verified something without showing the tool call.\n2. NEVER reason about a file. Call Read on it.\n</CRITICAL_MODEL_INSTRUCTION>';\n" +
"  }\n" +
"  if (modelLower.includes('glm') || modelLower.includes('qwen') || modelLower.includes('deepseek')) {\n" +
"    prompt += '\n\n<CRITICAL_MODEL_INSTRUCTION>\nStrictly adhere to output formats. Do NOT hallucinate parameters.\n</CRITICAL_MODEL_INSTRUCTION>';\n" +
"  }\n" +
"  if (agentName === 'chief') {\n" +
"    prompt += '\n\n<ROLE_ENFORCEMENT>\nCRITICAL RULE: YOU MUST NEVER WRITE CODE OR EXECUTE COMMANDS YOURSELF.\nYou are Atlas - Master Orchestrator. Conductor, not musician.\nYou DELEGATE, COORDINATE, and VERIFY using \'chief_task\'.\nWhen subagents return, you MUST verify their work. Subagents lie.\n</ROLE_ENFORCEMENT>';\n" +
"  } else if (agentName === 'deputy' || agentName === 'general' || agentName === 'explore') {\n" +
"    prompt += '\n\n<ROLE_ENFORCEMENT>\nYou are an IMPLEMENTER. You DO NOT delegate tasks. You NEVER use \'chief_task\'.\n</ROLE_ENFORCEMENT>';\n" +
"  }\n" +
"  return prompt;\n" +
"}\n\n";

if (!code.includes('injectModelPersona')) {
  code = code.replace('function mergeAgentsConfig', injectCode + 'function mergeAgentsConfig');
}

code = code.replace(
  'Record<string, { model?: string; prompt?: string; temperature?: number; skills?: string[]; mcp?: string[] }>',
  'Record<string, { model?: string; prompt?: string; temperature?: number; skills?: string[]; mcp?: string[]; permission?: Record<string, "allow"|"deny"|"ask"> }>'
);
code = code.replace(
  'Record<string, { model?: string; prompt?: string; temperature?: number; skills?: string[]; mcp?: string[] }> = {}',
  'Record<string, { model?: string; prompt?: string; temperature?: number; skills?: string[]; mcp?: string[]; permission?: Record<string, "allow"|"deny"|"ask"> }> = {}'
);

code = code.replace(
  'agents.chief = {',
  'const defaultChiefPerms = { "bash": "deny" as const, "edit_*": "deny" as const };\n  const defaultSubagentPerms = { "chief_task": "deny" as const };\n\n  agents.chief = {'
);

code = code.replace(
  'prompt: profile.prompts.chief,',
  'prompt: injectModelPersona("chief", profileConfig?.agents?.chief?.model ?? profile.agents.chief?.model, profile.prompts.chief, profileConfig?.agents?.chief?.description),'
);
code = code.replace(
  'mcp: profileConfig?.agents?.chief?.mcp,\n  }',
  'mcp: profileConfig?.agents?.chief?.mcp,\n    permission: { ...defaultChiefPerms, ...(profileConfig?.agents?.chief?.permission || {}) }\n  }'
);

code = code.replace(
  'prompt: profile.prompts.deputy + scoringPrompt,',
  'prompt: injectModelPersona("deputy", profileConfig?.agents?.deputy?.model ?? profile.agents.deputy?.model, profile.prompts.deputy + scoringPrompt, profileConfig?.agents?.deputy?.description),'
);
code = code.replace(
  'mcp: profileConfig?.agents?.deputy?.mcp,\n  }',
  'mcp: profileConfig?.agents?.deputy?.mcp,\n    permission: { ...defaultSubagentPerms, ...(profileConfig?.agents?.deputy?.permission || {}) }\n  }'
);

code = code.replace(
  'prompt: "You are a code explorer." + scoringPrompt,',
  'prompt: injectModelPersona("explore", profileConfig.agents.explore.model, "You are a code explorer." + scoringPrompt, profileConfig.agents.explore.description),'
);
code = code.replace(
  'mcp: profileConfig.agents.explore.mcp,\n    }',
  'mcp: profileConfig.agents.explore.mcp,\n      permission: { ...defaultSubagentPerms, ...(profileConfig.agents.explore.permission || {}) }\n    }'
);

code = code.replace(
  'prompt: "You are a general purpose assistant." + scoringPrompt,',
  'prompt: injectModelPersona("general", profileConfig.agents.general.model, "You are a general purpose assistant." + scoringPrompt, profileConfig.agents.general.description),'
);
code = code.replace(
  'mcp: profileConfig.agents.general.mcp,\n    }',
  'mcp: profileConfig.agents.general.mcp,\n      permission: { ...defaultSubagentPerms, ...(profileConfig.agents.general.permission || {}) }\n    }'
);

code = code.replace(
  'prompt: "You are a " + agentName + "." + scoringPrompt,',
  'prompt: injectModelPersona(agentName, agentConfig.model, "You are a " + agentName + "." + scoringPrompt, agentConfig.description),'
);
code = code.replace(
  'mcp: agentConfig.mcp,\n      }',
  'mcp: agentConfig.mcp,\n        permission: { ...defaultSubagentPerms, ...(agentConfig.permission || {}) }\n      }'
);

code = code.replace(
  'const newPermission = {\n        ...((baseAgent.permission as Record<string, unknown> | undefined) ?? {}),\n        ...mcpDenyRules,\n      }\n      const { mcp: _mcp, skills: _skills, ...agentCore } = cfg',
  'const configuredPermission = cfg.permission ?? {};\n      const newPermission = {\n        ...((baseAgent.permission as Record<string, unknown> | undefined) ?? {}),\n        ...mcpDenyRules,\n        ...configuredPermission,\n      }\n      const { mcp: _mcp, skills: _skills, permission: _perm, ...agentCore } = cfg'
);

fs.writeFileSync('E:/project/opencode-domain-kernel/src/adapters/opencode/index.ts', code);
