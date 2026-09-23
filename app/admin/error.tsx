"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import styles from "./operations-dashboard.module.css";

export default function AdminOperationsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.panel} role="alert">
          <div className={styles.errorState}>
            <TriangleAlert aria-hidden="true" />
            <div>
              <strong>Catalog Operations could not be loaded</strong>
              <p>An unexpected error interrupted the dashboard. No data was changed.</p>
              <button className={styles.primaryAction} onClick={reset} type="button" style={{ marginTop: 12 }}>
                <RotateCcw aria-hidden="true" />
                Try again
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
