import type {
  BackgroundResult,
  ChiefTaskInput,
  ChiefTaskResult,
  LegacyBridge,
  TaskExecutionStrategy,
} from "../strategy.js"
import { RuntimeExecutionStrategy } from "./runtime.js"

export class LegacyNewtypeExecutionStrategy implements TaskExecutionStrategy {
  constructor(
    private readonly fallback: RuntimeExecutionStrategy,
    private readonly bridge?: LegacyBridge
  ) {}

  async executeChiefTask(input: ChiefTaskInput): Promise<ChiefTaskResult> {
    if (this.bridge?.executeChiefTask) {
      return this.bridge.executeChiefTask(input)
    }
    const result = await this.fallback.executeChiefTask(input)
    return {
      ...result,
      output: `LegacyBridge: fallback-runtime\n${result.output}`,
    }
  }

  async getBackgroundOutput(taskID: string): Promise<BackgroundResult> {
    if (this.bridge?.getBackgroundOutput) {
      return this.bridge.getBackgroundOutput(taskID)
    }
    const result = await this.fallback.getBackgroundOutput(taskID)
    return { output: `LegacyBridge: fallback-runtime\n${result.output}` }
  }

  async cancelBackgroundTask(taskID: string): Promise<BackgroundResult> {
    if (this.bridge?.cancelBackgroundTask) {
      return this.bridge.cancelBackgroundTask(taskID)
    }
    const result = await this.fallback.cancelBackgroundTask(taskID)
    return { output: `LegacyBridge: fallback-runtime\n${result.output}` }
  }
}
