import { createOpenCodeAdapter } from "../adapters/opencode/index.js";
export function createKernelPlugin(config) {
    return async (ctx) => {
        const adapter = createOpenCodeAdapter(ctx, config.profile, config.disabledHooks ?? []);
        return adapter;
    };
}
