export type AgentType = "fact-checker" | "researcher" | "writer" | "editor" | "archivist" | "extractor" | string

export interface DimensionDefinition {
  name: string
  label: string
  description: string
  improvementHints: string[]
  goodExample?: string
  badExample?: string
}

// 默认维度配置
export const DEFAULT_DIMENSIONS: Record<string, DimensionDefinition[]> = {
  researcher: [
    {
      name: "coverage",
      label: "Coverage",
      description: "How completely the topic was explored",
      improvementHints: ["Search for additional angles", "Explore related subtopics"],
    },
    {
      name: "sources",
      label: "Sources",
      description: "Quality and reliability of sources found",
      improvementHints: ["Find primary sources", "Cross-reference claims"],
    }
  ]
}

export interface DimensionScore {
  name: string
  label: string
  score: number
  weak: boolean
}

export interface QualityAssessment {
  agentType: AgentType
  dimensions: DimensionScore[]
  overall: number
  weakest: DimensionScore
  allPass: boolean
}

// 修改这里：接收配置中的阈值和自定义维度
export function parseQualityScores(
  output: string, 
  threshold: number = 0.7,
  configuredDimensions?: string[]
): QualityAssessment | null {
  const lines = output.split("\n")
  let qualityStart = -1
  let overallStart = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith("**QUALITY SCORES:**")) {
      qualityStart = i
    } else if (line.startsWith("**OVERALL:**")) {
      overallStart = i
    }
  }

  if (qualityStart === -1) {
    return null
  }

  const dimensions: DimensionScore[] = []
  for (let i = qualityStart + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith("**OVERALL:**")) break
    if (!line.startsWith("-")) continue

    const match = line.match(/-\s*(\w+):\s*([\d.]+)/)
    if (match) {
      const name = match[1]
      const score = parseFloat(match[2])
      
      // 如果有配置的维度，只解析配置的维度；否则解析所有找到的维度
      if (!configuredDimensions || configuredDimensions.includes(name.toLowerCase())) {
        dimensions.push({
          name,
          label: name.charAt(0).toUpperCase() + name.slice(1),
          score,
          weak: score < threshold, // 使用配置的阈值！
        })
      }
    }
  }

  if (dimensions.length === 0) {
    return null
  }

  let overall = 0
  if (overallStart !== -1) {
    const overallMatch = lines[overallStart].match(/\*\*OVERALL:\*\*\s*([\d.]+)/)
    if (overallMatch) {
      overall = parseFloat(overallMatch[1])
    }
  } else {
    overall = dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length
  }

  const weakest = dimensions.reduce((min, d) => (d.score < min.score ? d : min), dimensions[0])

  return {
    agentType: detectAgentTypeFromOutput(output) || "custom",
    dimensions,
    overall,
    weakest,
    allPass: dimensions.every((d) => !d.weak),
  }
}

export function buildImprovementDirective(
  assessment: QualityAssessment, 
  threshold: number = 0.7
): string {
  const { agentType, dimensions } = assessment

  if (assessment.allPass) {
    return "All quality dimensions meet the threshold. Proceed with the task."
  }

  const weakDimensions = dimensions.filter((d) => d.weak)
  const agentDims = DEFAULT_DIMENSIONS[agentType as string] || []

  let prompt = "Your previous output has quality issues that need improvement.\n\n**Weak Dimensions:**\n"
  prompt += weakDimensions.map((d) => "- " + d.label + ": " + d.score.toFixed(2) + ` (threshold: ${threshold})`).join("\n")
  prompt += "\n**Improvement Instructions:**\n"

  for (const weakDim of weakDimensions) {
    const dimDef = agentDims.find((d) => d.name === weakDim.name)
    if (dimDef) {
      prompt += "\n\n### " + weakDim.label + "\n"
      prompt += dimDef.description + "\n\n"
      prompt += "**Improvement Hints:**\n"
      prompt += dimDef.improvementHints.map((hint) => "- " + hint).join("\n")
    } else {
      prompt += "\n\n### " + weakDim.label + "\n"
      prompt += "Improve the score for this dimension.\n"
    }
  }

  prompt += "\n\n4. Output your improved result with updated quality scores"

  return prompt
}

export function hasQualityScores(output: string): boolean {
  return output.includes("**QUALITY SCORES:**") || output.includes("**OVERALL:**")
}

export function detectAgentTypeFromOutput(output: string): AgentType | null {
  const lowerOutput = output.toLowerCase()

  for (const [agentType, dimensions] of Object.entries(DEFAULT_DIMENSIONS)) {
    for (const dim of dimensions) {
      if (lowerOutput.includes(dim.label.toLowerCase() + ":")) {
        return agentType as AgentType
      }
    }
  }

  if (lowerOutput.includes("fact-check")) return "fact-checker"
  if (lowerOutput.includes("research")) return "researcher"
  if (lowerOutput.includes("write")) return "writer"
  if (lowerOutput.includes("edit")) return "editor"

  return null
}
