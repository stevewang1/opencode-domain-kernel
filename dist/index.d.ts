import type { DomainName, KernelConfig } from "./core/types.js";
export declare function createDomainKernelPlugin(domain: DomainName, options?: Omit<KernelConfig, "profile">): import("@opencode-ai/plugin").Plugin;
export * from "./core/types.js";
export * from "./profiles/index.js";
