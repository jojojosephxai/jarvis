// Tests never use the real vault or a live external service.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('node:path');
process.env.OBSIDIAN_VAULT_PATH = path.resolve('tests/fixtures/vault');
process.env.XAI_API_KEY = '';
process.env.AZURE_SPEECH_KEY = '';
process.env.AZURE_SPEECH_REGION = '';
globalThis.fetch = async input => { throw new Error(`Unmocked network request in a test: ${new URL(String(input)).hostname}`); };
