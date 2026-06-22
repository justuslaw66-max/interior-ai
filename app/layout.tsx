import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { PostHogProvider } from "@/app/providers/PostHogProvider";
import { IdentifyGate } from "@/app/providers/IdentifyGate";
import { validateCatalogOrThrow } from "@/lib/catalog-runtime";
import { validateEnvOrThrow } from "@/lib/config";

const isProdLike =
  process.env.APP_ENV === "staging" ||
  process.env.APP_ENV === "production" ||
  process.env.VERCEL_ENV === "preview" ||
  process.env.VERCEL_ENV === "production";

const analyticsDisabled = process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS === "1";

export const metadata: Metadata = {
  title: "Interior AI",
  description: "AI-powered furniture design and room visualization",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  validateEnvOrThrow();
  // Try to validate catalog, but don't fail the page if it errors
  try {
    validateCatalogOrThrow();
  } catch (err) {
    if (isProdLike) {
      throw err;
    }
    console.warn("⚠️ Catalog validation warning:", err instanceof Error ? err.message : err);
    // Continue in development for faster iteration.
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <AuthProvider>
          <PostHogProvider analyticsDisabled={analyticsDisabled}>
            <IdentifyGate analyticsDisabled={analyticsDisabled}>{children}</IdentifyGate>
          </PostHogProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
