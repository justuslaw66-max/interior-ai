/**
 * The Mapbox access token for the admin condo map: MAPBOX_PUBLIC_TOKEN, read on the server when the page renders and
 * handed to the browser, which is where Mapbox needs it. Only a public token (`pk.`) is used: a secret one (`sk.`)
 * must never reach a browser, so anything else counts as no token. Restrict the token to the app's addresses in
 * Mapbox's account page.
 */
const PUBLIC_TOKEN = /^pk\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function mapboxPublicToken(value: string | undefined = process.env.MAPBOX_PUBLIC_TOKEN): string | null {
  const token = value?.trim() ?? "";
  return PUBLIC_TOKEN.test(token) ? token : null;
}
