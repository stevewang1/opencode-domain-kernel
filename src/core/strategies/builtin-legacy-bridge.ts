import type { LegacyBridge } from "../strategy.js"
import { RuntimeExecutionStrategy } from "./runtime.js"

function withLegacyHeader(output: string): string {
  return [`LegacyBridge: builtin-newtype`, output].filter(Boolean).join("\n")
}

export function createBuiltinLegacyBridge(
  runtimeStrategy: RuntimeExecutionStrategy
): LegacyBridge {
  return {
    async executeChiefTask(input) {
      const result = await runtimeStrategy.executeChiefTask(input)
      return {
        ...result,
        output: withLegacyHeader(result.output),
      }
    },
    async getBackgroundOutput(taskID) {
      const result = await runtimeStrategy.getBackgroundOutput(taskID)
      return { output: withLegacyHeader(result.output) }
    },
    async cancelBackgroundTask(taskID) {
      const result = await runtimeStrategy.cancelBackgroundTask(taskID)
      return { output: withLegacyHeader(result.output) }
    },
  }
}
