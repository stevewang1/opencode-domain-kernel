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

export interface TaskExecutionStrategy {
  executeChiefTask(input: ChiefTaskInput): Promise<ChiefTaskResult>
  getBackgroundOutput(taskID: string): Promise<BackgroundResult>
  cancelBackgroundTask(taskID: string): Promise<BackgroundResult>
}
