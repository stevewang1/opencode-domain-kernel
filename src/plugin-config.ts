import * as fs from "node:fs"
import * as path from "node:path"
import { DomainKernelConfigSchema, type DomainKernelConfig } from "./config/index.js"
import { getUserConfigDir } from "./shared/config-path.js"

export function loadConfigFromPath(configPath: string): DomainKernelConfig | null {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8")
      const rawConfig = JSON.parse(content)
      const result = DomainKernelConfigSchema.safeParse(rawConfig)
      if (!result.success) {
        console.error("Config validation error in " + configPath + ":", result.error.issues)
        return null
      }
      console.log("Config loaded from " + configPath, {
        profile: result.data.profile,
        agents: result.data.agents,
      })
      return result.data
    }
  } catch (err) {
    console.error("Error loading config from " + configPath + ":", err)
  }
  return null
}

export function mergeConfigs(
  base: DomainKernelConfig,
  override: DomainKernelConfig
): DomainKernelConfig {
  const mergedAgents = {
    ...base.agents,
    ...override.agents,
  }
  const mergedDisabled = [
    ...new Set([
      ...(base.disabled_agents ?? []),
      ...(override.disabled_agents ?? []),
    ]),
  ]
  const baseTimeout = base.execution?.timeout ?? 600000
  const overrideTimeout = override.execution?.timeout
  const mergedExecution = {
    ...base.execution,
    ...override.execution,
    timeout: overrideTimeout ?? baseTimeout,
  }
  return {
    ...base,
    ...override,
    agents: mergedAgents,
    disabled_agents: mergedDisabled,
    execution: mergedExecution,
  }
}

export function loadPluginConfig(directory: string): DomainKernelConfig {
  const userConfigPath = path.join(
    getUserConfigDir(),
    "opencode",
    "domain-kernel-profile.json"
  )
  const projectConfigPath = path.join(
    directory,
    ".opencode",
    "domain-kernel-profile.json"
  )

  const defaultConfig: DomainKernelConfig = { profile: "content" }
  const userConfig = loadConfigFromPath(userConfigPath) ?? defaultConfig
  
  const projectConfig = loadConfigFromPath(projectConfigPath)
  if (projectConfig) {
    return mergeConfigs(userConfig, projectConfig)
  }

  console.log("Final merged config", {
    profile: userConfig.profile,
    agents: userConfig.agents,
  })
  return userConfig
}

export type { DomainKernelConfig }
