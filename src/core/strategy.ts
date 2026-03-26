export interface ChiefTaskInput {
  description: string
  prompt: string
  subagentType: string
  runInBackground: boolean
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

export interface ExecutionOptions {
  legacyBridge?: LegacyBridge
  legacyBridgeFactory?: LegacyBridgeFactory
}

export interface TaskExecutionStrategy {
  executeChiefTask(input: ChiefTaskInput): Promise<ChiefTaskResult>
  getBackgroundOutput(taskID: string): Promise<BackgroundResult>
  cancelBackgroundTask(taskID: string): Promise<BackgroundResult>
}
