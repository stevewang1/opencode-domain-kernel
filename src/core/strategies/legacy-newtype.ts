import type { BackgroundResult, ChiefTaskInput, ChiefTaskResult, TaskExecutionStrategy } from "../strategy.js"
import { RuntimeExecutionStrategy } from "./runtime.js"

export class LegacyNewtypeExecutionStrategy implements TaskExecutionStrategy {
  constructor(private readonly fallback: RuntimeExecutionStrategy) {}

  async executeChiefTask(input: ChiefTaskInput): Promise<ChiefTaskResult> {
    const result = await this.fallback.executeChiefTask(input)
    return {
      ...result,
      output: `LegacyBridge: pending\n${result.output}`,
    }
  }

  async getBackgroundOutput(taskID: string): Promise<BackgroundResult> {
    const result = await this.fallback.getBackgroundOutput(taskID)
    return { output: `LegacyBridge: pending\n${result.output}` }
  }

  async cancelBackgroundTask(taskID: string): Promise<BackgroundResult> {
    const result = await this.fallback.cancelBackgroundTask(taskID)
    return { output: `LegacyBridge: pending\n${result.output}` }
  }
}
