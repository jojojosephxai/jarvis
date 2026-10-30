import { test as base, expect } from '@playwright/test';

export { expect };
export const test = base.extend({
  externalNetworkGuard: [async ({ context }, use) => {
    const external = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
        external.push(url.hostname);
        await route.abort();
      } else await route.continue();
    });
    await context.routeWebSocket(/api\.x\.ai/, socket => {
      external.push('api.x.ai');
      socket.close();
    });
    await context.route('**/api/do-next', route => route.fulfill({ json: { items: [] } }));
    await use();
    expect(external, 'No xAI or third-party network calls are allowed').toEqual([]);
  }, { auto: true }],
});
