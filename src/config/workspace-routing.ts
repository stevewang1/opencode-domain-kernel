import type { DomainName } from "../core/types.js"

export interface WorkspaceDomainRouting {
  codeRoots: string[]
  contentRoots: string[]
}

export const defaultWorkspaceDomainRouting: WorkspaceDomainRouting = {
  codeRoots: ["e:/project"],
  contentRoots: ["c:/users/19051", "e:/lm studio", "e:/lm studio models", "d:/note"],
}

function normalizeWorkspacePath(input: string): string {
  return input.toLowerCase().replace(/\\/g, "/")
}

function isInRoots(workspace: string, roots: string[]): boolean {
  return roots.some((root) => workspace === root || workspace.startsWith(root + "/"))
}

export function resolveDomainFromWorkspace(
  workspacePath: string,
  configuredDefault: DomainName = "content",
  routing: WorkspaceDomainRouting = defaultWorkspaceDomainRouting
): DomainName {
  const normalizedWorkspace = normalizeWorkspacePath(workspacePath)
  const normalizedCodeRoots = routing.codeRoots.map(normalizeWorkspacePath)
  const normalizedContentRoots = routing.contentRoots.map(normalizeWorkspacePath)

  if (isInRoots(normalizedWorkspace, normalizedCodeRoots)) return "code"
  if (isInRoots(normalizedWorkspace, normalizedContentRoots)) return "content"
  return configuredDefault
}
