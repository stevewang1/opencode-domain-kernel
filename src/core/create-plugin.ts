import type { Plugin } from "@opencode-ai/plugin"
import type { KernelConfig } from "./types.js"
import { createOpenCodeAdapter } from "../adapters/opencode/index.js"

export function createKernelPlugin(config: KernelConfig): Plugin {
  return async (ctx) => {
    return createOpenCodeAdapter(ctx, config.profile, config.disabledHooks ?? [])
  }
}
