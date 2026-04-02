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
  const mergedProfiles: NonNullable<DomainKernelConfig["profiles"]> = {}
  const profileNames = new Set([
    ...Object.keys(base.profiles ?? {}),
    ...Object.keys(override.profiles ?? {}),
  ])
  for (const profileName of profileNames) {
    const baseProfile = base.profiles?.[profileName]
    const overrideProfile = override.profiles?.[profileName]
    const mergedProfileExecution = (baseProfile?.execution || overrideProfile?.execution)
      ? {
          strategy: overrideProfile?.execution?.strategy ?? baseProfile?.execution?.strategy,
          timeout: overrideProfile?.execution?.timeout ?? baseProfile?.execution?.timeout ?? 600000,
        }
      : undefined
    const mergedAgents: NonNullable<ProfileConfig["agents"]> = {
      ...(baseProfile?.agents ?? {}),
      ...(overrideProfile?.agents ?? {}),
    }
    const agentNames = new Set([
      ...Object.keys(baseProfile?.agents ?? {}),
      ...Object.keys(overrideProfile?.agents ?? {}),
    ])
    for (const agentName of agentNames) {
      const baseAgent = baseProfile?.agents?.[agentName as keyof typeof baseProfile.agents]
      const overrideAgent = overrideProfile?.agents?.[agentName as keyof typeof overrideProfile.agents]
      if (baseAgent || overrideAgent) {
        mergedAgents[agentName as keyof typeof mergedAgents] = {
          ...(baseAgent ?? {}),
          ...(overrideAgent ?? {}),
        }
      }
    }
    mergedProfiles[profileName] = {
      ...(baseProfile ?? {}),
      ...(overrideProfile ?? {}),
      agents: Object.keys(mergedAgents).length > 0 ? mergedAgents : undefined,
      quality: {
        ...(baseProfile?.quality ?? {}),
        ...(overrideProfile?.quality ?? {}),
      },
      execution: mergedProfileExecution,
    }
  }

  const mergedTopAgents: NonNullable<DomainKernelConfig["agents"]> = {
    ...(base.agents ?? {}),
    ...(override.agents ?? {}),
  }
  const topAgentNames = new Set([
    ...Object.keys(base.agents ?? {}),
    ...Object.keys(override.agents ?? {}),
  ])
  for (const agentName of topAgentNames) {
    const baseAgent = base.agents?.[agentName as keyof typeof base.agents]
    const overrideAgent = override.agents?.[agentName as keyof typeof override.agents]
    if (baseAgent || overrideAgent) {
      mergedTopAgents[agentName as keyof typeof mergedTopAgents] = {
        ...(baseAgent ?? {}),
        ...(overrideAgent ?? {}),
      }
    }
  }

  const mergedExecution = {
    strategy: override.execution?.strategy ?? base.execution?.strategy,
    timeout: override.execution?.timeout ?? base.execution?.timeout ?? 600000,
  }
  return {
    ...base,
    ...override,
    profiles: Object.keys(mergedProfiles).length > 0 ? mergedProfiles : undefined,
    agents: Object.keys(mergedTopAgents).length > 0 ? mergedTopAgents : undefined,
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
