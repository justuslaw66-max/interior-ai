import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  DraftingCompass,
  ExternalLink,
  Gauge,
  Inbox,
  MousePointerClick,
  PackageCheck,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type {
  AttentionItemData,
  OperationsDashboardData,
  RecentOperationData,
  StatusTone,
  ToolContextData,
} from "./operations-data";
import { AdminPageHeader } from "./AdminPageHeader";
import styles from "./operations-dashboard.module.css";

type ToolDefinition = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

type ToolGroupDefinition = {
  title: string;
  description: string;
  tools: ToolDefinition[];
};

const TOOL_GROUPS: ToolGroupDefinition[] = [
  {
    title: "Catalog",
    description: "Intake, triage, and publishing decisions",
    tools: [
      {
        title: "Catalog inbox",
        description: "Route incoming supplier work",
        href: "/admin/catalog/inbox",
        icon: Inbox,
      },
      {
        title: "Catalog review",
        description: "Resolve mappings and metadata QA",
        href: "/admin/catalog/review",
        icon: ClipboardCheck,
      },
    ],
  },
  {
    title: "Assets & processing",
    description: "3D model preparation and pipeline control",
    tools: [
      {
        title: "Models",
        description: "Inspect geometry and model metadata",
        href: "/admin/models",
        icon: Boxes,
      },
      {
        title: "Import jobs",
        description: "Track processing and failed jobs",
        href: "/admin/imports",
        icon: PackageCheck,
      },
      {
        title: "GLB optimizer",
        description: "Prepare assets before import",
        href: "/tools/glb-optimizer",
        icon: Gauge,
      },
    ],
  },
  {
    title: "Review & reliability",
    description: "Human review and publication safeguards",
    tools: [
      {
        title: "Floor-plan review",
        description: "Resolve extraction uncertainty",
        href: "/admin/floor-plans",
        icon: DraftingCompass,
      },
      {
        title: "Catalog audit",
        description: "Inspect catalog and media issues",
        href: "/admin/audit",
        icon: ShieldCheck,
      },
    ],
  },
  {
    title: "Commerce",
    description: "Product interest and outbound performance",
    tools: [
      {
        title: "Affiliate clicks",
        description: "Review product traffic and exports",
        href: "/admin/clicks",
        icon: MousePointerClick,
      },
    ],
  },
];

function cx(...classNames: Array<string | undefined | false>) {
  return classNames.filter(Boolean).join(" ");
}

function formatRelativeTime(date: Date) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (elapsedMinutes < 1) return "Just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays}d ago`;
  return date.toLocaleDateString();
}

function StatusBadge({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <span className={cx(styles.statusBadge, styles[`status_${tone}`])}>
      <span aria-hidden="true" className={styles.statusDot} />
      {children}
    </span>
  );
}

function OperationsHeader({ lastUpdated }: { lastUpdated: Date }) {
  return (
    <AdminPageHeader
      crumbs={[{ title: "Overview" }]}
      title="Overview"
      description="Prioritize review work, monitor processing, and keep the live catalog healthy."
      actions={
        <>
          <span className={styles.dateContext}>
            <Clock3 aria-hidden="true" />
            Last 24 hours · updated {formatRelativeTime(lastUpdated)}
          </span>
          <Link className={styles.primaryAction} href="/admin/catalog/review">
            Open catalog review
            <ArrowRight aria-hidden="true" />
          </Link>
        </>
      }
    />
  );
}

function AttentionItem({ item }: { item: AttentionItemData }) {
  const severityLabel =
    item.severity === "critical"
      ? "Critical"
      : item.severity === "warning"
        ? "Warning"
        : "Unavailable";

  return (
    <Link className={cx(styles.attentionItem, styles[`attention_${item.severity}`])} href={item.href}>
      <span className={styles.attentionIcon}>
        {item.severity === "critical" ? (
          <TriangleAlert aria-hidden="true" />
        ) : item.severity === "warning" ? (
          <Clock3 aria-hidden="true" />
        ) : (
          <Wrench aria-hidden="true" />
        )}
      </span>
      <span className={styles.attentionCopy}>
        <span className={styles.attentionTitleRow}>
          <strong>{item.title}</strong>
          <span className={styles.severityLabel}>{severityLabel}</span>
        </span>
        <span className={styles.attentionDescription}>{item.description}</span>
        <span className={styles.inlineAction}>
          {item.actionLabel}
          <ArrowRight aria-hidden="true" />
        </span>
      </span>
      <span className={styles.attentionCount} aria-label={item.count === null ? "Count unavailable" : `${item.count} affected`}>
        {item.count === null ? "—" : item.count.toLocaleString()}
      </span>
    </Link>
  );
}

function AttentionQueue({ items }: { items: AttentionItemData[] }) {
  return (
    <section className={styles.panel} aria-labelledby="attention-heading">
      <div className={styles.panelHeader}>
        <div>
          <h2 id="attention-heading">Needs attention</h2>
          <p>Queues and failures that require an operator decision.</p>
        </div>
        {items.length > 0 ? <span className={styles.panelCount}>{items.length}</span> : null}
      </div>
      {items.length > 0 ? (
        <div className={styles.attentionList}>
          {items.map((item) => (
            <AttentionItem item={item} key={item.id} />
          ))}
        </div>
      ) : (
        <div className={styles.successState}>
          <CheckCircle2 aria-hidden="true" />
          <div>
            <strong>No urgent work</strong>
            <p>Review queues, processing jobs, and publication gates are clear.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function SystemHealthSummary({ data }: { data: OperationsDashboardData["health"] }) {
  const overallLabel =
    data.overall === "healthy" ? "Healthy" : data.overall === "attention" ? "Degraded" : "Partial data";
  const overallTone: StatusTone =
    data.overall === "healthy" ? "success" : data.overall === "attention" ? "warning" : "neutral";

  return (
    <section className={styles.panel} aria-labelledby="health-heading">
      <div className={styles.panelHeader}>
        <div>
          <h2 id="health-heading">System health</h2>
          <p>Operational checks across critical services.</p>
        </div>
        <StatusBadge tone={overallTone}>{overallLabel}</StatusBadge>
      </div>
      <div className={styles.healthList}>
        {data.services.map((service) => {
          const tone: StatusTone =
            service.state === "operational" ? "success" : service.state === "degraded" ? "warning" : "neutral";
          return (
            <div className={styles.healthRow} key={service.name}>
              <span>
                <strong>{service.name}</strong>
                <small>{service.detail}</small>
              </span>
              <StatusBadge tone={tone}>
                {service.state === "operational" ? "Operational" : service.state === "degraded" ? "Issue" : "Unavailable"}
              </StatusBadge>
            </div>
          );
        })}
      </div>
      <div className={styles.panelFooter}>
        <Link href="/admin/audit">Open quality audit</Link>
        {data.sentryUrl ? (
          <a href={data.sentryUrl} rel="noreferrer" target="_blank">
            Open monitoring
            <ExternalLink aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </section>
  );
}

function ActivityOverview({ data }: { data: OperationsDashboardData }) {
  return (
    <section className={styles.activityPanel} aria-labelledby="activity-heading">
      <div className={styles.activityHeading}>
        <div>
          <h2 id="activity-heading">Non-authoritative customer analytics</h2>
          <p>Interaction signals from the last 24 hours; these are not lifecycle evidence.</p>
        </div>
        {!data.activityAvailable ? <StatusBadge tone="neutral">Unavailable</StatusBadge> : null}
      </div>
      <div className={styles.metricGrid}>
        {data.activity.map((metric) => (
          <div className={styles.metric} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value === null ? "—" : metric.value.toLocaleString()}</strong>
            <small>{metric.detail}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function ToolNavigationItem({ tool, context }: { tool: ToolDefinition; context: ToolContextData }) {
  const Icon = tool.icon;

  return (
    <Link className={styles.toolItem} href={tool.href}>
      <span className={styles.toolIcon}>
        <Icon aria-hidden="true" />
      </span>
      <span className={styles.toolCopy}>
        <strong>{tool.title}</strong>
        <small>{tool.description}</small>
      </span>
      <span className={styles.toolContext}>
        {context.value !== null ? <strong>{context.value.toLocaleString()}</strong> : null}
        <StatusBadge tone={context.tone}>{context.label}</StatusBadge>
      </span>
      <ArrowRight aria-hidden="true" className={styles.toolArrow} />
    </Link>
  );
}

function ToolGroup({ group, context }: { group: ToolGroupDefinition; context: Record<string, ToolContextData> }) {
  return (
    <section className={styles.toolGroup}>
      <div className={styles.toolGroupHeader}>
        <h3>{group.title}</h3>
        <p>{group.description}</p>
      </div>
      <div className={styles.toolList}>
        {group.tools.map((tool) => (
          <ToolNavigationItem
            context={context[tool.href] ?? { value: null, label: "Open tool", tone: "neutral" }}
            key={tool.href}
            tool={tool}
          />
        ))}
      </div>
    </section>
  );
}

function AdminTools({ context }: { context: Record<string, ToolContextData> }) {
  return (
    <section aria-labelledby="tools-heading">
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="tools-heading">Admin tools</h2>
          <p>Grouped by the workflow they support.</p>
        </div>
        <span>8 tools</span>
      </div>
      <div className={styles.toolGroupGrid}>
        {TOOL_GROUPS.map((group) => (
          <ToolGroup context={context} group={group} key={group.title} />
        ))}
      </div>
    </section>
  );
}

function RecentOperationsTable({
  operations,
  available,
}: {
  operations: RecentOperationData[];
  available: boolean;
}) {
  return (
    <section className={styles.panel} aria-labelledby="recent-operations-heading">
      <div className={styles.panelHeader}>
        <div>
          <h2 id="recent-operations-heading">Recent operations</h2>
          <p>Latest asset and floor-plan jobs, ordered by update time.</p>
        </div>
        <Link className={styles.headerLink} href="/admin/imports">View all imports</Link>
      </div>
      {!available ? (
        <div className={styles.errorState} role="status">
          <TriangleAlert aria-hidden="true" />
          <div>
            <strong>Operations unavailable</strong>
            <p>The asset and floor-plan queues could not be loaded.</p>
          </div>
        </div>
      ) : operations.length === 0 ? (
        <div className={styles.emptyState}>
          <PackageCheck aria-hidden="true" />
          <div>
            <strong>No recent operations</strong>
            <p>New asset and floor-plan jobs will appear here.</p>
          </div>
        </div>
      ) : (
        <div className={styles.tableScroller}>
          <table className={styles.operationsTable}>
            <caption className={styles.srOnly}>Recent asset import and floor-plan operations</caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Workflow</th>
                <th scope="col">Status</th>
                <th scope="col">Owner</th>
                <th scope="col">Updated</th>
                <th scope="col">Issue</th>
                <th scope="col"><span className={styles.srOnly}>Action</span></th>
              </tr>
            </thead>
            <tbody>
              {operations.map((operation) => (
                <tr key={operation.id}>
                  <td data-label="Item">
                    <Link className={styles.operationLink} href={operation.href}>{operation.label}</Link>
                  </td>
                  <td data-label="Workflow">{operation.workflow}</td>
                  <td data-label="Status"><StatusBadge tone={operation.statusTone}>{operation.statusLabel}</StatusBadge></td>
                  <td className={styles.ownerCell} data-label="Owner">
                    <UserRound aria-hidden="true" />
                    <span title={operation.owner}>{operation.owner}</span>
                  </td>
                  <td className={styles.timeCell} data-label="Updated" title={operation.updatedAt.toLocaleString()}>{formatRelativeTime(operation.updatedAt)}</td>
                  <td className={styles.issueCell} data-label="Issue">
                    <span title={operation.issue ?? undefined}>{operation.issue ?? "—"}</span>
                  </td>
                  <td data-label="Action">
                    <Link className={styles.rowAction} href={operation.href} aria-label={`Open ${operation.label}`}>
                      Open
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RuntimePolicy({ data }: { data: OperationsDashboardData }) {
  return (
    <details className={styles.policyPanel}>
      <summary>
        <span>
          <Wrench aria-hidden="true" />
          <span>
            <strong>Importer QA policy</strong>
            <small>Active server safeguards · read only</small>
          </span>
        </span>
        <span className={styles.policySummaryMeta}>
          Finish mapping {data.finishGateEnabled ? "enabled" : "disabled"}
          <span aria-hidden="true">+</span>
        </span>
      </summary>
      <div className={styles.policyBody}>
        <div className={styles.policyGrid}>
          {data.qaPolicy.map((item) => (
            <div key={item.environmentName}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <code>{item.environmentName}</code>
            </div>
          ))}
        </div>
        <div className={styles.policyDirectory}>
          <span>QA report directory</span>
          <code>{data.qaReportDirectory}</code>
        </div>
      </div>
    </details>
  );
}

export default function OperationsDashboard({ data }: { data: OperationsDashboardData }) {
  return (
    <main className={styles.main}>
      <OperationsHeader lastUpdated={data.health.lastUpdated} />

      <div className={styles.priorityGrid}>
        <div className={styles.priorityMain}>
          <AttentionQueue items={data.attentionItems} />
          <ActivityOverview data={data} />
        </div>
        <SystemHealthSummary data={data.health} />
      </div>

      <AdminTools context={data.toolContext} />

      <RecentOperationsTable
        available={data.recentOperationsAvailable}
        operations={data.recentOperations}
      />

      <RuntimePolicy data={data} />

      <footer className={styles.pageFooter}>
        <span>Interior AI Admin</span>
        <span>Operational data refreshes on page load.</span>
      </footer>
    </main>
  );
}
