export interface ChiefTaskInput {
  description: string
  prompt: string
  subagentType: string
  runInBackground: boolean
  sessionID?: string
  category?: string
  resume?: string
  skills?: string[]
}

export interface ChiefTaskResult {
  output: string
  taskID?: string
}

export interface BackgroundResult {
  output: string
}

export interface LegacyBridge {
  executeChiefTask?(input: ChiefTaskInput): Promise<ChiefTaskResult>
  getBackgroundOutput?(taskID: string): Promise<BackgroundResult>
  cancelBackgroundTask?(taskID: string): Promise<BackgroundResult>
}

export type LegacyBridgeFactory = () =>
  | LegacyBridge
  | undefined
  | Promise<LegacyBridge | undefined>

export interface LegacyBridgeModuleConfig {
  modulePath: string
  exportName?: string
}

export interface RuntimeSessionClient {
  session: {
    create(input: unknown): Promise<unknown>
    promptAsync(input: unknown): Promise<unknown>
    messages(input: unknown): Promise<unknown>
  }
}

export interface ExecutionOptions {
  legacyBridge?: LegacyBridge
  legacyBridgeFactory?: LegacyBridgeFactory
  legacyBridgeModule?: LegacyBridgeModuleConfig
  runtimeClient?: RuntimeSessionClient
}

export interface TaskExecutionStrategy {
  executeChiefTask(input: ChiefTaskInput): Promise<ChiefTaskResult>
  getBackgroundOutput(taskID: string): Promise<BackgroundResult>
  cancelBackgroundTask(taskID: string): Promise<BackgroundResult>
}
