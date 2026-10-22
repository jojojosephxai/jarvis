// Tests never use the real vault or a live external service.
const path = require('node:path');
process.env.OBSIDIAN_VAULT_PATH = path.resolve('tests/fixtures/vault');
process.env.XAI_API_KEY = '';
globalThis.fetch = async input => { throw new Error(`Unmocked network request in a test: ${new URL(String(input)).hostname}`); };
