import styles from "./operations-dashboard.module.css";

function Skeleton({ width, height }: { width: string; height: number }) {
  return <span className={styles.skeleton} style={{ display: "block", height, width }} />;
}

/** Any admin page while it loads, inside Admin's frame (UX phase 4i): a heading, then a panel. */
export default function AdminLoading() {
  return (
    <main className={styles.main} aria-busy="true" aria-label="Loading">
      <div className={styles.pageHeader}>
        <div>
          <Skeleton height={11} width="120px" />
          <div style={{ height: 8 }} />
          <Skeleton height={30} width="260px" />
          <div style={{ height: 8 }} />
          <Skeleton height={12} width="min(560px, 90vw)" />
        </div>
      </div>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <Skeleton height={14} width="128px" />
        </div>
        {[0, 1, 2, 3].map((row) => (
          <div className={styles.attentionItem} key={row}>
            <Skeleton height={30} width="30px" />
            <span>
              <Skeleton height={11} width="min(280px, 70vw)" />
              <span style={{ display: "block", height: 8 }} />
              <Skeleton height={9} width="min(360px, 75vw)" />
            </span>
            <Skeleton height={22} width="28px" />
          </div>
        ))}
      </section>
    </main>
  );
}
