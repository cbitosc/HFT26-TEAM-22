// Kept dependency-free so the store can read it without pulling Zod and the AI client into the
// main bundle; the AI client itself only loads with the AI Assistant screen.
export const FEATHERLESS_ENDPOINT = 'https://api.featherless.ai/v1/chat/completions';
export const DEFAULT_FEATHERLESS_MODEL = 'meta-llama/Meta-Llama-3.1-8B-Instruct';
