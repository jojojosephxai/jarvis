import { cp, rm } from 'node:fs/promises';
export default async function setup() {
  await rm('work/e2e-vault', { recursive: true, force: true });
  await cp('tests/fixtures/vault', 'work/e2e-vault', { recursive: true });
}
