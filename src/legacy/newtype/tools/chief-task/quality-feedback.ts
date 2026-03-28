/**
 * Quality Feedback Loop for chief_task
 */

import {
  parseQualityScores,
  buildImprovementDirective,
  hasQualityScores,
  type QualityAssessment,
  type AgentType,
} from "../../hooks/chief-orchestrator/quality-dimensions.js"
import { log } from "../../shared/logger.js"

const LOG_PREFIX = "[quality-feedback]"

export const MAX_REWRITE_ATTEMPTS = 2

export interface QualityFeedbackResult {
  originalOutput: string
  assessment: QualityAssessment | null
  allPass: boolean
  shouldRetry: boolean
  attemptNumber: number
  improvementPrompt: string | null
  status: "passed" | "needs_improvement" | "max_attempts_reached" | "no_scores"
}

export function categoryToAgentType(category?: string): AgentType | null {
  if (!category) return null
  const map: Record<string, AgentType> = {
    "fact-check": "fact-checker",
    research: "researcher",
    writing: "writer",
    editing: "editor",
    archive: "archivist",
    extraction: "extractor",
  }
  return map[category] ?? null
}

export function agentNameToAgentType(agentName?: string): AgentType | null {
  return agentName as AgentType
}

export function analyzeQualityForRetry(
  output: string,
  attemptNumber: number,
  threshold: number = 0.7,
  configuredDimensions?: string[]
): QualityFeedbackResult {
  log(LOG_PREFIX + " Attempt " + attemptNumber + " - Analyzing output quality (threshold: " + threshold + ")")

  if (!hasQualityScores(output)) {
    log(LOG_PREFIX + " No quality scores found in output")
    return {
      originalOutput: output,
      assessment: null,
      allPass: true,
      shouldRetry: false,
      attemptNumber,
      improvementPrompt: null,
      status: "no_scores",
    }
  }

  const assessment = parseQualityScores(output, threshold, configuredDimensions)

  if (!assessment) {
    log(LOG_PREFIX + " Failed to parse quality scores")
    return {
      originalOutput: output,
      assessment: null,
      allPass: true,
      shouldRetry: false,
      attemptNumber,
      improvementPrompt: null,
      status: "no_scores",
    }
  }

  const { allPass, dimensions, overall } = assessment
  log(LOG_PREFIX + " Parsed scores. Overall: " + overall + ". All pass: " + allPass)

  if (allPass) {
    log(LOG_PREFIX + " All dimensions passed quality threshold")
    return {
      originalOutput: output,
      assessment,
      allPass: true,
      shouldRetry: false,
      attemptNumber,
      improvementPrompt: null,
      status: "passed",
    }
  }

  const reachedMaxAttempts = attemptNumber >= MAX_REWRITE_ATTEMPTS
  const weakDimensions = dimensions.filter((d) => d.weak)
  log(LOG_PREFIX + " Weak dimensions: " + weakDimensions.map((d) => d.name + "(" + d.score + ")").join(", "))

  if (reachedMaxAttempts) {
    log(LOG_PREFIX + " Max rewrite attempts reached. Accepting result.")
    return {
      originalOutput: output,
      assessment,
      allPass: false,
      shouldRetry: false,
      attemptNumber,
      improvementPrompt: null,
      status: "max_attempts_reached",
    }
  }

  log(LOG_PREFIX + " Output needs improvement. Generating retry prompt.")
  
  const prompt = buildImprovementDirective(assessment, threshold)

  return {
    originalOutput: output,
    assessment,
    allPass: false,
    shouldRetry: true,
    attemptNumber,
    improvementPrompt: prompt,
    status: "needs_improvement",
  }
}

export function formatFinalOutput(result: QualityFeedbackResult, sessionID: string): string {
  const { status, assessment, attemptNumber, originalOutput } = result

  if (status === "no_scores") {
    return originalOutput
  }

  let header = ""
  if (status === "passed") {
    header = "✅ **Quality Check Passed** (Attempt " + attemptNumber + ")\n"
  } else if (status === "max_attempts_reached") {
    header = "⚠️ **Quality Check Incomplete** (Max attempts reached)\n"
  }

  if (assessment) {
    header += "*Overall Score: " + assessment.overall + "*\n"
    header += "*Dimensions: " + assessment.dimensions.map((d) => d.label + "(" + d.score + ")").join(", ") + "*\n"
  }

  return header + "\n---\n\n" + originalOutput
}
