import { permanentRedirect } from "next/navigation";

export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * /d/<token> was the first public viewer and drew items as plain boxes. Share
 * tokens are the same, so old links go to the current share page.
 */
export default async function LegacyShareLinkRedirect({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  permanentRedirect(`/share/${encodeURIComponent(token)}`);
}
