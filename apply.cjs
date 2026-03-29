const fs = require('fs');

let code = fs.readFileSync('E:/project/opencode-domain-kernel/src/adapters/opencode/index.ts', 'utf8');

// 1. Extract the old mergeAgentsConfig function until createOpenCodeAdapter
const startIndex = code.indexOf('function mergeAgentsConfig');
const endIndex = code.indexOf('export function createOpenCodeAdapter');

if (startIndex !== -1 && endIndex !== -1) {
  const injectText = fs.readFileSync('E:/project/opencode-domain-kernel/inject.txt', 'utf8');
  code = code.substring(0, startIndex) + injectText + '\n\n' + code.substring(endIndex);
}

// 2. Replace configHook
const hookStart = code.indexOf('  const configHook: Hooks["config"] = async (config) => {');
const hookEnd = code.indexOf('  const afterHook: Hooks["tool.execute.after"]');

if (hookStart !== -1 && hookEnd !== -1) {
  const hookText = fs.readFileSync('E:/project/opencode-domain-kernel/hook.txt', 'utf8');
  code = code.substring(0, hookStart) + hookText + '\n\n' + code.substring(hookEnd);
}

fs.writeFileSync('E:/project/opencode-domain-kernel/src/adapters/opencode/index.ts', code);
console.log('Applied patch successfully!');
