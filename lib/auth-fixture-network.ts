const GOOGLE_ISSUER = "https://accounts.google.com";
const GOOGLE_DISCOVERY_URL = `${GOOGLE_ISSUER}/.well-known/openid-configuration`;

export const SYNTHETIC_CI_GOOGLE_DISCOVERY_MARKER =
  "[auth-fixture-network] served canonical inert Google discovery";

export async function syntheticCiGoogleFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  const request = new Request(input, init);
  if (request.method !== "GET" || request.url !== GOOGLE_DISCOVERY_URL) {
    throw new Error(
      "[auth] Synthetic CI OAuth fixture blocked an external provider request",
    );
  }

  console.log(SYNTHETIC_CI_GOOGLE_DISCOVERY_MARKER);
  return Response.json(
    {
      issuer: GOOGLE_ISSUER,
      authorization_endpoint: `${GOOGLE_ISSUER}/o/oauth2/v2/auth`,
      token_endpoint: "https://oauth2.googleapis.com/token",
      userinfo_endpoint: "https://openidconnect.googleapis.com/v1/userinfo",
      jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      code_challenge_methods_supported: ["S256"],
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
