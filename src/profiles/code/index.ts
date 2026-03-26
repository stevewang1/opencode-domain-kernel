import type { DomainProfile } from "../../core/types.js"

export const codeProfile: DomainProfile = {
  name: "code",
  agents: {
    chief: { name: "chief", model: "anthropic/claude-opus-4-1" },
    deputy: {
      name: "deputy",
      model: "google/antigravity-claude-sonnet-4-5",
      temperature: 0.05,
    },
  },
  routing: {
    defaultExecutor: "deputy",
    allowDirectExecution: true,
  },
  quality: {
    dimensions: ["correctness", "maintainability", "safety", "tests"],
    passThreshold: 0.85,
  },
  prompts: {
    chief: "You are Chief. Coordinate software engineering execution with strict quality gates.",
    deputy: "You are Deputy. Prefer direct edits, run validations, and escalate only when specialized analysis is required.",
  },
  artifacts: {
    summaryFormat: "code",
  },
  execution: {
    strategy: "runtime",
  },
}
