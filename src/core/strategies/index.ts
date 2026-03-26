import { KernelRuntime } from "../runtime.js"
import type { ExecutionOptions, TaskExecutionStrategy } from "../strategy.js"
import type { DomainProfile } from "../types.js"
import { LegacyNewtypeExecutionStrategy } from "./legacy-newtype.js"
import { RuntimeExecutionStrategy } from "./runtime.js"

export function createExecutionStrategy(
  profile: DomainProfile,
  options?: ExecutionOptions
): TaskExecutionStrategy {
  const runtime = new KernelRuntime()
  const runtimeStrategy = new RuntimeExecutionStrategy(runtime, profile)

  if (profile.execution.strategy === "legacy-newtype") {
    return new LegacyNewtypeExecutionStrategy(runtimeStrategy, options?.legacyBridge)
  }

  return runtimeStrategy
}
