import type { Plugin } from "@opencode-ai/plugin"
import type { KernelConfig } from "./types.js"
import { createOpenCodeAdapter } from "../adapters/opencode/index.js"

export function createKernelPlugin(config: KernelConfig): Plugin {
  return async (ctx) => {
    const adapter = createOpenCodeAdapter(ctx, config.profile, config.disabledHooks ?? [])
    return adapter as Awaited<ReturnType<Plugin>>
  }
}
