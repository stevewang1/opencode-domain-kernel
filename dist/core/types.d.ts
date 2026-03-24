export type DomainName = "code" | "content" | (string & {});
export interface AgentSpec {
    name: string;
    model?: string;
    temperature?: number;
}
export interface RoutingPolicy {
    defaultExecutor: string;
    allowDirectExecution: boolean;
}
export interface QualityPolicy {
    dimensions: string[];
    passThreshold: number;
}
export interface PromptTemplates {
    chief: string;
    deputy: string;
}
export interface ArtifactPolicy {
    summaryFormat: "code" | "content" | "generic";
}
export interface DomainProfile {
    name: DomainName;
    agents: Record<string, AgentSpec>;
    routing: RoutingPolicy;
    quality: QualityPolicy;
    prompts: PromptTemplates;
    artifacts: ArtifactPolicy;
}
export interface KernelConfig {
    profile: DomainProfile;
    disabledHooks?: string[];
}
