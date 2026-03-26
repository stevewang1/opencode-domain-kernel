import type {
  BackgroundResult,
  ChiefTaskInput,
  ChiefTaskResult,
  LegacyBridge,
  LegacyBridgeFactory,
  TaskExecutionStrategy,
} from "../strategy.js"
import { RuntimeExecutionStrategy } from "./runtime.js"

export class LegacyNewtypeExecutionStrategy implements TaskExecutionStrategy {
  private bridgePromise?: Promise<LegacyBridge | undefined>

  constructor(
    private readonly fallback: RuntimeExecutionStrategy,
    private readonly bridge?: LegacyBridge,
    private readonly bridgeFactory?: LegacyBridgeFactory
  ) {}

  private resolveBridge(): Promise<LegacyBridge | undefined> {
    if (this.bridge) {
      return Promise.resolve(this.bridge)
    }
    if (!this.bridgeFactory) {
      return Promise.resolve(undefined)
    }
    if (!this.bridgePromise) {
      this.bridgePromise = Promise.resolve(this.bridgeFactory()).catch(() => undefined)
    }
    return this.bridgePromise
  }

  async executeChiefTask(input: ChiefTaskInput): Promise<ChiefTaskResult> {
    const bridge = await this.resolveBridge()
    if (bridge?.executeChiefTask) {
      try {
        return await bridge.executeChiefTask(input)
      } catch {
      }
    }
    const result = await this.fallback.executeChiefTask(input)
    return {
      ...result,
      output: `LegacyBridge: fallback-runtime\n${result.output}`,
    }
  }

  async getBackgroundOutput(taskID: string): Promise<BackgroundResult> {
    const bridge = await this.resolveBridge()
    if (bridge?.getBackgroundOutput) {
      try {
        return await bridge.getBackgroundOutput(taskID)
      } catch {
      }
    }
    const result = await this.fallback.getBackgroundOutput(taskID)
    return { output: `LegacyBridge: fallback-runtime\n${result.output}` }
  }

  async cancelBackgroundTask(taskID: string): Promise<BackgroundResult> {
    const bridge = await this.resolveBridge()
    if (bridge?.cancelBackgroundTask) {
      try {
        return await bridge.cancelBackgroundTask(taskID)
      } catch {
      }
    }
    const result = await this.fallback.cancelBackgroundTask(taskID)
    return { output: `LegacyBridge: fallback-runtime\n${result.output}` }
  }
}
