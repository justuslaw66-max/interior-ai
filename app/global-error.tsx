"use client";

/**
 * Last-resort page when the root layout itself fails. It replaces the whole
 * document, so it carries its own markup and inline styles instead of relying
 * on the app stylesheet.
 */
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f5f5f5", color: "#0a0a0a" }}>
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <section style={{ maxWidth: 420, background: "#fff", border: "1px solid #e5e5e5", borderRadius: 8, padding: 24 }}>
            <h1 style={{ margin: 0, fontSize: 20 }}>Something went wrong</h1>
            <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6, color: "#525252" }}>
              Interior AI hit an unexpected problem. Your saved designs are safe. Try again, or reopen the editor.
            </p>
            <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={reset}
                style={{ padding: "8px 16px", borderRadius: 6, border: 0, background: "#0a0a0a", color: "#fff", fontSize: 14 }}
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.assign("/design")}
                style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #e5e5e5", background: "#fff", color: "#404040", fontSize: 14 }}
              >
                Open the editor
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
