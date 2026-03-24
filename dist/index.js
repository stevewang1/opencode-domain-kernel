import { createKernelPlugin } from "./core/create-plugin.js";
import { resolveProfile } from "./profiles/index.js";
export function createDomainKernelPlugin(domain, options) {
    const profile = resolveProfile(domain);
    return createKernelPlugin({
        ...options,
        profile,
    });
}
export * from "./core/types.js";
export * from "./profiles/index.js";
