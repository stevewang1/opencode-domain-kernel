import type { DomainName, DomainProfile } from "../core/types.js"
import { codeProfile } from "./code/index.js"
import { contentProfile } from "./content/index.js"

const profiles: Record<string, DomainProfile> = {
  code: codeProfile,
  content: contentProfile,
}

export function resolveProfile(name: DomainName): DomainProfile {
  return profiles[name] ?? contentProfile
}

export { codeProfile, contentProfile }
