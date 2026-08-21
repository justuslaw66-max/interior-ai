const RELOAD_GENERATION_SESSION_KEY =
  "interior-ai:glb-diagnostics-reload-generation";

export type GLBDiagnosticRealmGlobal = typeof globalThis & {
  __INTERIOR_AI_GLB_DIAGNOSTICS_GENERATION__?: number;
};

export function getReloadGeneration(
  diagnosticsGlobal: GLBDiagnosticRealmGlobal,
) {
  if (
    Number.isInteger(
      diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_GENERATION__,
    )
  ) {
    return diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_GENERATION__ as number;
  }

  let generation = 1;
  try {
    const previous = Number.parseInt(
      window.sessionStorage.getItem(RELOAD_GENERATION_SESSION_KEY) ?? "0",
      10,
    );
    generation = Number.isInteger(previous) && previous >= 0 ? previous + 1 : 1;
    window.sessionStorage.setItem(
      RELOAD_GENERATION_SESSION_KEY,
      String(generation),
    );
  } catch {
    // Sandboxed documents can deny session storage. The per-document default
    // still prevents identities from crossing a JavaScript global boundary.
  }
  diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_GENERATION__ = generation;
  return generation;
}
