import * as fs from "node:fs"
import * as path from "node:path"
import { DomainKernelConfigSchema, type DomainKernelConfig, type ProfileConfig } from "./config/index.js"
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
        defaultProfile: result.data.defaultProfile,
        profiles: Object.keys(result.data.profiles || {}),
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
  const mergedExecution = {
    strategy: override.execution?.strategy ?? base.execution?.strategy,
    timeout: override.execution?.timeout ?? base.execution?.timeout ?? 600000,
  }
  return {
    ...base,
    ...override,
    profiles: {
      ...base.profiles,
      ...override.profiles,
    },
    disabled_agents: [
      ...new Set([
        ...(base.disabled_agents ?? []),
        ...(override.disabled_agents ?? []),
      ]),
    ],
    execution: mergedExecution,
  }
}

export function getProfileConfig(
  config: DomainKernelConfig,
  profileName: string
): ProfileConfig | null {
  if (config.profiles && config.profiles[profileName]) {
    return config.profiles[profileName]
  }
  return null
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

  const defaultConfig: DomainKernelConfig = { defaultProfile: "content" }
  const userConfig = loadConfigFromPath(userConfigPath) ?? defaultConfig

  const projectConfig = loadConfigFromPath(projectConfigPath)
  if (projectConfig) {
    return mergeConfigs(userConfig, projectConfig)
  }

  console.log("Final merged config", {
    defaultProfile: userConfig.defaultProfile,
    profiles: Object.keys(userConfig.profiles || {}),
  })
  return userConfig
}

export type { DomainKernelConfig, ProfileConfig }
