import { KernelRuntime } from "../runtime.js"
import type { ExecutionOptions, TaskExecutionStrategy } from "../strategy.js"
import type { DomainProfile } from "../types.js"
import { createBuiltinLegacyBridge } from "./builtin-legacy-bridge.js"
import { LegacyNewtypeExecutionStrategy } from "./legacy-newtype.js"
import { RuntimeExecutionStrategy } from "./runtime.js"

export function createExecutionStrategy(
  profile: DomainProfile,
  options?: ExecutionOptions
): TaskExecutionStrategy {
  const runtime = new KernelRuntime()
  const runtimeStrategy = new RuntimeExecutionStrategy(runtime, profile, options?.runtimeClient)

  if (profile.execution.strategy === "legacy-newtype") {
    const hasCustomBridge = Boolean(
      options?.legacyBridge || options?.legacyBridgeFactory || options?.legacyBridgeModule
    )
    return new LegacyNewtypeExecutionStrategy(
      runtimeStrategy,
      options?.legacyBridge ?? (hasCustomBridge ? undefined : createBuiltinLegacyBridge(runtimeStrategy)),
      options?.legacyBridgeFactory,
      options?.legacyBridgeModule
    )
  }

  return runtimeStrategy
}
