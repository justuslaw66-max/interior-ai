import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { PostHogProvider } from "@/app/providers/PostHogProvider";
import { IdentifyGate } from "@/app/providers/IdentifyGate";
import { validateCatalogOrThrow } from "@/lib/catalog-runtime";
import { validateEnvOrThrow } from "@/lib/config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    console.warn("⚠️ Catalog validation warning:", err instanceof Error ? err.message : err);
    // Continue anyway - lenient mode allows this
  }

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <PostHogProvider>
            <IdentifyGate>{children}</IdentifyGate>
          </PostHogProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
