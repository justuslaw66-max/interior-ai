import { test as base, expect, Page } from '@playwright/test';

type TestFixtures = {
  authenticatedPage: Page;
};

export const test = base.extend<TestFixtures>({
  authenticatedPage: async ({ page }: { page: Page }, use) => {
    // Mock authentication by setting session in localStorage or via API
    // This assumes you have a test user seeded in the database
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForLoadState('networkidle');
    
    // Login or set mock session (adjust based on your auth setup)
    // For now, we'll just proceed - adjust if you need actual auth token
    
    await use(page);
  },
});

export { expect };
