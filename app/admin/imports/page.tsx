import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

type ImportJobListItem = {
  id: string;
  status: string;
  sourceBrand: string | null;
  sourceFileName: string;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const STATUS_TONE: Record<string, string> = {
  failed: "bg-red-50 text-red-700 border-red-200",
  needs_review: "bg-amber-50 text-amber-800 border-amber-200",
  needs_mapping: "bg-blue-50 text-blue-700 border-blue-200",
  published: "bg-green-50 text-green-700 border-green-200",
};

function statusTone(status: string): string {
  return STATUS_TONE[status] ?? "bg-neutral-50 text-neutral-700 border-neutral-200";
}

export default async function AdminImportsPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/");
  }

  const prismaCompat = prisma as unknown as {
    importJob: {
      findMany: (args: {
        orderBy: { createdAt: "desc" };
        take: number;
        select: {
          id: true;
          status: true;
          sourceBrand: true;
          sourceFileName: true;
          errorMessage: true;
          createdAt: true;
          updatedAt: true;
        };
      }) => Promise<ImportJobListItem[]>;
    };
  };

  const jobs = await prismaCompat.importJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      status: true,
      sourceBrand: true,
      sourceFileName: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const summary = {
    received: jobs.filter((job) => job.status === "received").length,
    processing: jobs.filter((job) => ["normalizing", "optimized", "preview_generated", "metadata_extracted"].includes(job.status)).length,
    needsMapping: jobs.filter((job) => job.status === "needs_mapping").length,
    needsReview: jobs.filter((job) => job.status === "needs_review").length,
    failed: jobs.filter((job) => job.status === "failed").length,
    published: jobs.filter((job) => job.status === "published").length,
  };

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Import Jobs</h1>
        <p className="text-sm text-neutral-600">Intake-to-handoff job tracking for asset pipeline.</p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Received</div>
          <div className="text-lg font-semibold">{summary.received}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Processing</div>
          <div className="text-lg font-semibold">{summary.processing}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Needs mapping</div>
          <div className="text-lg font-semibold">{summary.needsMapping}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Needs review</div>
          <div className="text-lg font-semibold">{summary.needsReview}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Failed</div>
          <div className="text-lg font-semibold">{summary.failed}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Published</div>
          <div className="text-lg font-semibold">{summary.published}</div>
        </div>
      </section>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-neutral-50 text-left">
              <th className="px-3 py-2 font-medium">Job</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Brand</th>
              <th className="px-3 py-2 font-medium">Updated</th>
              <th className="px-3 py-2 font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b align-top">
                <td className="px-3 py-2 font-medium">
                  <Link className="text-blue-600 hover:text-blue-700" href={`/admin/imports/${job.id}`}>
                    {job.id}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${statusTone(job.status)}`}>
                    {job.status}
                  </span>
                </td>
                <td className="px-3 py-2">{job.sourceFileName}</td>
                <td className="px-3 py-2">{job.sourceBrand ?? "-"}</td>
                <td className="px-3 py-2 text-neutral-600">{job.updatedAt.toLocaleString()}</td>
                <td className="px-3 py-2 text-xs text-neutral-600">{job.errorMessage ?? "-"}</td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-xs text-neutral-500">
                  No import jobs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
