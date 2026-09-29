"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import styles from "./operations-dashboard.module.css";

/** Any admin page that failed to load, inside Admin's frame (UX phase 4i). */
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className={styles.main}>
      <section className={styles.panel} role="alert">
        <div className={styles.errorState}>
          <TriangleAlert aria-hidden="true" />
          <div>
            <strong>{"This page couldn't be loaded"}</strong>
            <p>Something went wrong while loading it. Nothing was changed.</p>
            <button className={styles.primaryAction} onClick={reset} type="button" style={{ marginTop: 12 }}>
              <RotateCcw aria-hidden="true" />
              Try again
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
