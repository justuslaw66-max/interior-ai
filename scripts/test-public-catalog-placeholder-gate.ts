import { shouldIncludePlaceholderCatalog } from "../lib/catalog";

type Case = {
  name: string;
  env: Parameters<typeof shouldIncludePlaceholderCatalog>[0];
  expected: boolean;
};

const cases: Case[] = [
  {
    name: "disabled by default",
    env: {},
    expected: false,
  },
  {
    name: "enabled in development when explicitly requested",
    env: {
      NODE_ENV: "development",
      CATALOG_INCLUDE_PLACEHOLDER_ITEMS: "true",
    },
    expected: true,
  },
  {
    name: "enabled for local builds when APP_ENV explicitly opts into development",
    env: {
      APP_ENV: "development",
      NODE_ENV: "production",
      CATALOG_INCLUDE_PLACEHOLDER_ITEMS: "1",
    },
    expected: true,
  },
  {
    name: "blocked in production node env",
    env: {
      NODE_ENV: "production",
      CATALOG_INCLUDE_PLACEHOLDER_ITEMS: "true",
    },
    expected: false,
  },
  {
    name: "blocked in staging app env",
    env: {
      APP_ENV: "staging",
      CATALOG_INCLUDE_PLACEHOLDER_ITEMS: "true",
    },
    expected: false,
  },
  {
    name: "blocked in Vercel preview",
    env: {
      VERCEL_ENV: "preview",
      CATALOG_INCLUDE_PLACEHOLDER_ITEMS: "true",
    },
    expected: false,
  },
  {
    name: "blocked in Vercel production",
    env: {
      VERCEL_ENV: "production",
      CATALOG_INCLUDE_PLACEHOLDER_ITEMS: "true",
    },
    expected: false,
  },
];

const failures = cases.filter(({ env, expected }) => shouldIncludePlaceholderCatalog(env) !== expected);

if (failures.length > 0) {
  console.log("Public catalog placeholder gate failures:");
  for (const failure of failures) {
    console.log(`- ${failure.name}: expected ${failure.expected}`);
  }
  throw new Error("Public catalog placeholder gate failed");
}

console.log("Public catalog placeholder gate passed");
