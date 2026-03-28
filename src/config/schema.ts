import { z } from "zod"

export const AgentConfigSchema = z.object({
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  prompt: z.string().optional(),
  prompt_append: z.string().optional(),
  description: z.string().optional(),
  mode: z.enum(["subagent", "primary", "all"]).optional(),
})

export const AgentsConfigSchema = z.object({
  chief: AgentConfigSchema.optional(),
  deputy: AgentConfigSchema.optional(),
  explore: AgentConfigSchema.optional(),
  general: AgentConfigSchema.optional(),
  researcher: AgentConfigSchema.optional(),
  writer: AgentConfigSchema.optional(),
  editor: AgentConfigSchema.optional(),
  "fact-checker": AgentConfigSchema.optional(),
  archivist: AgentConfigSchema.optional(),
  extractor: AgentConfigSchema.optional(),
})

export const ExecutionConfigSchema = z.object({
  strategy: z.enum(["legacy-newtype", "builtin-legacy-bridge"]).optional(),
  timeout: z.number().optional().default(600000),
})

export const DomainKernelConfigSchema = z.object({
  "$schema": z.string().optional(),
  profile: z.enum(["content", "code"]).optional().default("content"),
  agents: AgentsConfigSchema.optional(),
  disabled_agents: z.array(z.string()).optional(),
  execution: ExecutionConfigSchema.optional(),
})

export type AgentConfig = z.infer<typeof AgentConfigSchema>
export type AgentsConfig = z.infer<typeof AgentsConfigSchema>
export type ExecutionConfig = z.infer<typeof ExecutionConfigSchema>
export type DomainKernelConfig = z.infer<typeof DomainKernelConfigSchema>
