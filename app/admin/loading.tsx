import styles from "./operations-dashboard.module.css";

function Skeleton({ width, height }: { width: string; height: number }) {
  return <span className={styles.skeleton} style={{ display: "block", height, width }} />;
}

export default function AdminOperationsLoading() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="Loading Catalog Operations">
      <header className={styles.appHeader}>
        <div className={styles.appHeaderInner}>
          <Skeleton height={30} width="132px" />
          <Skeleton height={32} width="min(440px, 100%)" />
          <Skeleton height={30} width="82px" />
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <div>
            <Skeleton height={10} width="90px" />
            <div style={{ height: 8 }} />
            <Skeleton height={30} width="260px" />
            <div style={{ height: 8 }} />
            <Skeleton height={12} width="min(560px, 90vw)" />
          </div>
          <Skeleton height={36} width="164px" />
        </div>
        <div className={styles.priorityGrid}>
          {[0, 1].map((panel) => (
            <section className={styles.panel} key={panel}>
              <div className={styles.panelHeader}>
                <Skeleton height={14} width="128px" />
                <Skeleton height={22} width="62px" />
              </div>
              {[0, 1, 2].map((row) => (
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
          ))}
        </div>
        <section className={styles.activityPanel} style={{ marginTop: 16 }}>
          <div className={styles.activityHeading}><Skeleton height={14} width="120px" /></div>
          <div className={styles.metricGrid}>
            {[0, 1, 2, 3, 4].map((metric) => (
              <div className={styles.metric} key={metric}>
                <Skeleton height={9} width="72px" />
                <span style={{ display: "block", height: 8 }} />
                <Skeleton height={22} width="40px" />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
