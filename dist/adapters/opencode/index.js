export function createOpenCodeAdapter(_ctx, profile, _disabledHooks) {
    const agent = {
        chief: {
            model: profile.agents.chief?.model,
            prompt: profile.prompts.chief,
        },
        deputy: {
            model: profile.agents.deputy?.model,
            prompt: profile.prompts.deputy,
            temperature: profile.agents.deputy?.temperature,
        },
    };
    return {
        tool: {
            chief_task: true,
            background_output: true,
            background_cancel: true,
        },
        hook: {},
        agent,
    };
}
