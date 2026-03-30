import { createKernelPlugin } from "./core/create-plugin.js"
import type { DomainName, KernelConfig } from "./core/types.js"
import { resolveProfile } from "./profiles/index.js"

export function createDomainKernelPlugin(domain: DomainName, options?: Omit<KernelConfig, "profile">) {
  const profile = resolveProfile(domain)
  return createKernelPlugin({
    ...options,
    profile,
  })
}

export * from "./core/types.js"
export * from "./core/strategy.js"
export * from "./profiles/index.js"
export * from "./config/workspace-routing.js"
