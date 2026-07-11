import type { NextConfig } from "next";

function resolvePostHogProxyDestinations(rawHost: string | undefined) {
  const configuredHost = (rawHost || "").trim().replace(/\/+$/, "");
  if (configuredHost) {
    const parsed = new URL(configuredHost);
    if (parsed.protocol !== "https:") {
      throw new Error("NEXT_PUBLIC_POSTHOG_HOST must use HTTPS in hosted environments.");
    }

    if (!parsed.hostname.endsWith("posthog.com")) {
      return { apiHost: configuredHost, assetHost: configuredHost };
    }

    if (parsed.hostname.startsWith("eu.") || parsed.hostname.startsWith("eu-")) {
      return {
        apiHost: "https://eu.i.posthog.com",
        assetHost: "https://eu-assets.i.posthog.com",
      };
    }
  }

  return {
    apiHost: "https://us.i.posthog.com",
    assetHost: "https://us-assets.i.posthog.com",
  };
}

const postHogProxy = resolvePostHogProxyDestinations(
  process.env.NEXT_PUBLIC_POSTHOG_HOST || process.env.POSTHOG_HOST
);

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: `${postHogProxy.assetHost}/static/:path*`,
      },
      {
        source: "/ingest/array/:path*",
        destination: `${postHogProxy.assetHost}/array/:path*`,
      },
      {
        source: "/ingest/:path*",
        destination: `${postHogProxy.apiHost}/:path*`,
      },
    ];
  },
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
