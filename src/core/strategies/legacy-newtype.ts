import type {
  BackgroundResult,
  ChiefTaskInput,
  ChiefTaskResult,
  LegacyBridge,
  LegacyBridgeFactory,
  LegacyBridgeModuleConfig,
  TaskExecutionStrategy,
} from "../strategy.js"
import { RuntimeExecutionStrategy } from "./runtime.js"

export class LegacyNewtypeExecutionStrategy implements TaskExecutionStrategy {
  private bridgePromise?: Promise<LegacyBridge | undefined>

  constructor(
    private readonly fallback: RuntimeExecutionStrategy,
    private readonly bridge?: LegacyBridge,
    private readonly bridgeFactory?: LegacyBridgeFactory,
    private readonly bridgeModule?: LegacyBridgeModuleConfig
  ) {}

  private async loadBridgeFromModule(): Promise<LegacyBridge | undefined> {
    if (!this.bridgeModule?.modulePath) {
      return undefined
    }
    const loaded = (await import(this.bridgeModule.modulePath)) as Record<string, unknown>
    const exportName = this.bridgeModule.exportName ?? "default"
    const candidate = loaded[exportName]
    if (!candidate) {
      return undefined
    }
    if (typeof candidate === "function") {
      const resolved = await Promise.resolve(
        (candidate as () => LegacyBridge | undefined | Promise<LegacyBridge | undefined>)()
      )
      return resolved
    }
    return candidate as LegacyBridge
  }

  private resolveBridge(): Promise<LegacyBridge | undefined> {
    if (this.bridge) {
      return Promise.resolve(this.bridge)
    }
    if (!this.bridgeFactory && !this.bridgeModule) {
      return Promise.resolve(undefined)
    }
    if (!this.bridgePromise) {
      this.bridgePromise = (async () => {
        try {
          if (this.bridgeFactory) {
            const bridge = await Promise.resolve(this.bridgeFactory())
            if (bridge) return bridge
          }
          return this.loadBridgeFromModule()
        } catch {
          return undefined
        }
      })()
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
