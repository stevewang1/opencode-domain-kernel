import type { DomainProfile } from "../../core/types.js"

type OpenCodeCtx = {
  directory: string
}

type OpenCodePluginResult = {
  tool: Record<string, unknown>
  hook: Record<string, unknown>
  agent: Record<string, unknown>
}

export function createOpenCodeAdapter(
  _ctx: OpenCodeCtx,
  profile: DomainProfile,
  _disabledHooks: string[]
): OpenCodePluginResult {
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

  return {
    tool: {
      chief_task: true,
      background_output: true,
      background_cancel: true,
    },
    hook: {},
    agent,
  }
}
