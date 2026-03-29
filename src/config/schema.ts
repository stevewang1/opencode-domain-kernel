import { z } from "zod"

export const AgentConfigSchema = z.object({
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  prompt: z.string().optional(),
  prompt_append: z.string().optional(),
  skills: z.array(z.string()).optional(),
  mcp: z.array(z.string()).optional(), // 允许使用的 MCP 服务器名称列表
  permission: z.record(z.string(), z.enum(["allow", "deny", "ask"])).optional(), // 新增：底层物理权限控制
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

export const QualityConfigSchema = z.object({
  dimensions: z.array(z.string()).optional(),
  passThreshold: z.number().optional(),
})

export const ProfileConfigSchema = z.object({
  agents: AgentsConfigSchema.optional(),
  quality: QualityConfigSchema.optional(),
  execution: ExecutionConfigSchema.optional(),
})

export const DomainKernelConfigSchema = z.object({
  "$schema": z.string().optional(),
  defaultProfile: z.enum(["content", "code"]).optional().default("content"),
  profiles: z.record(z.string(), ProfileConfigSchema).optional(),
  agents: AgentsConfigSchema.optional(),
  disabled_agents: z.array(z.string()).optional(),
  execution: ExecutionConfigSchema.optional(),
})

export type AgentConfig = z.infer<typeof AgentConfigSchema>
export type AgentsConfig = z.infer<typeof AgentsConfigSchema>
export type ExecutionConfig = z.infer<typeof ExecutionConfigSchema>
export type QualityConfig = z.infer<typeof QualityConfigSchema>
export type ProfileConfig = z.infer<typeof ProfileConfigSchema>
export type DomainKernelConfig = z.infer<typeof DomainKernelConfigSchema>
