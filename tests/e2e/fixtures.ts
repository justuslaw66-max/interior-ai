import { test as base, expect, Page } from '@playwright/test';

const RELEASE_BASE_URL = process.env.PLAYWRIGHT_RELEASE_BASE_URL
  ?.trim()
  .replace(/\/+$/, '');
const VERCEL_PROTECTION_BYPASS =
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

type TestFixtures = {
  authenticatedPage: Page;
  releaseProtectionBypass: void;
};

export const test = base.extend<TestFixtures>({
  releaseProtectionBypass: [async ({ context }, fixtureDone) => {
    const leakedBypassRequests: string[] = [];

    if (RELEASE_BASE_URL && VERCEL_PROTECTION_BYPASS) {
      // A request-scoped header cannot follow browser subresource requests.
      // Redirects stay disabled because Playwright propagates request headers
      // across redirects, which could expose the bypass secret off-origin.
      const cookiesBefore = await context.cookies(RELEASE_BASE_URL);
      const previousCookieValues = new Map(
        cookiesBefore.map((cookie) => [
          `${cookie.name}\n${cookie.domain}\n${cookie.path}`,
          cookie.value,
        ])
      );
      const response = await context.request.get(RELEASE_BASE_URL, {
        failOnStatusCode: false,
        headers: {
          'x-vercel-protection-bypass': VERCEL_PROTECTION_BYPASS,
          'x-vercel-set-bypass-cookie': 'true',
        },
        maxRedirects: 0,
      });
      const responseOrigin = new URL(response.url()).origin;
      const responseStatus = response.status();
      const responseHeaders = await response.headersArray();
      await response.dispose();

      if (responseOrigin !== new URL(RELEASE_BASE_URL).origin) {
        throw new Error(
          'The Vercel bypass bootstrap response did not remain on the RC origin.'
        );
      }

      if (responseStatus >= 400) {
        throw new Error(
          `The Vercel bypass bootstrap failed with HTTP ${responseStatus}.`
        );
      }

      const setCookieReceived = responseHeaders.some(
        (header) => header.name.toLowerCase() === 'set-cookie'
      );
      const releaseCookies = await context.cookies(RELEASE_BASE_URL);
      const secureCookieChanged = releaseCookies.some((cookie) => {
        const previousValue = previousCookieValues.get(
          `${cookie.name}\n${cookie.domain}\n${cookie.path}`
        );
        return cookie.secure && previousValue !== cookie.value;
      });

      if (!setCookieReceived || !secureCookieChanged) {
        throw new Error(
          'The protected RC did not issue a new secure origin-scoped bypass cookie.'
        );
      }

      const auditBrowserRequest = (browserRequest: { headers(): Record<string, string> }) => {
        const headers = browserRequest.headers();
        if (
          headers['x-vercel-protection-bypass'] ||
          headers['x-vercel-set-bypass-cookie']
        ) {
          leakedBypassRequests.push('blocked');
        }
      };
      context.on('request', auditBrowserRequest);

      try {
        await fixtureDone();
      } finally {
        context.off('request', auditBrowserRequest);
      }

      if (leakedBypassRequests.length > 0) {
        throw new Error(
          'A Vercel bypass header escaped the request-scoped RC bootstrap.'
        );
      }

      return;
    }

    await fixtureDone();
  }, { auto: true }],
  authenticatedPage: async ({ page }: { page: Page }, fixtureDone) => {
    // Mock authentication by setting session in localStorage or via API
    // This assumes you have a test user seeded in the database
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForLoadState('networkidle');
    
    // Login or set mock session (adjust based on your auth setup)
    // For now, we'll just proceed - adjust if you need actual auth token
    
    await fixtureDone(page);
  },
});

export { expect };
