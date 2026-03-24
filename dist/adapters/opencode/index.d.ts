import type { DomainProfile } from "../../core/types.js";
type OpenCodeCtx = {
    directory: string;
};
type OpenCodePluginResult = {
    tool: Record<string, unknown>;
    hook: Record<string, unknown>;
    agent: Record<string, unknown>;
};
export declare function createOpenCodeAdapter(_ctx: OpenCodeCtx, profile: DomainProfile, _disabledHooks: string[]): OpenCodePluginResult;
export {};
