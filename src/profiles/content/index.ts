import type { DomainProfile } from "../../core/types.js"

export const contentProfile: DomainProfile = {
  name: "content",
  agents: {
    chief: { name: "chief", model: "anthropic/claude-opus-4-1" },
    deputy: {
      name: "deputy",
      model: "google/antigravity-claude-sonnet-4-5",
      temperature: 0.1,
    },
  },
  routing: {
    defaultExecutor: "deputy",
    allowDirectExecution: true,
  },
  quality: {
    dimensions: ["accuracy", "structure", "readability", "consistency"],
    passThreshold: 0.8,
  },
  prompts: {
    chief: "You are Chief. Coordinate and delegate for content production tasks.",
    deputy: "You are Deputy. Execute directly when possible, dispatch specialists only when needed.",
  },
  artifacts: {
    summaryFormat: "content",
  },
}
