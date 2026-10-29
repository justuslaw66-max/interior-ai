"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, buttonClassName } from "@/components/ui/Button";

type IconProps = {
  className?: string;
};

function Icon({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function AlertTriangle({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Icon>
  );
}

function CheckCircle2({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M21.8 11.1v.9a10 10 0 1 1-5.9-9.1" />
      <path d="m9 11 3 3L22 4" />
    </Icon>
  );
}

function Download({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </Icon>
  );
}

function FileArchive({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M10 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M10 2v6h6" />
      <path d="M10 12h4" />
      <path d="M10 16h4" />
    </Icon>
  );
}

function RotateCcw({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </Icon>
  );
}

function Upload({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </Icon>
  );
}

type OptimizerStep = {
  step: string;
  success: boolean;
  details: string;
  toolUnavailable?: boolean;
};

type OptimizerResult = {
  fileName: string;
  url: string;
  sourceSize: number;
  optimizedSize: number;
  steps: OptimizerStep[];
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function readSteps(response: Response): OptimizerStep[] {
  const header = response.headers.get("X-Optimizer-Steps");
  if (!header) return [];

  try {
    const decoded = decodeURIComponent(header);
    const parsed = JSON.parse(decoded);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readFileName(response: Response) {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/i);
  return match?.[1] ?? "optimized.glb";
}

export default function GlbOptimizerPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizerResult | null>(null);

  const sizeDelta = useMemo(() => {
    if (!result) return null;
    const delta = result.sourceSize - result.optimizedSize;
    const percent = result.sourceSize > 0 ? Math.round((delta / result.sourceSize) * 100) : 0;
    return { delta, percent };
  }, [result]);

  useEffect(() => {
    return () => {
      if (result?.url) URL.revokeObjectURL(result.url);
    };
  }, [result?.url]);

  function setSelectedFile(nextFile: File | null) {
    setError(null);
    setResult((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
    setFile(nextFile);
  }

  async function optimize() {
    if (!file) {
      setError("Choose a GLB or glTF file first.");
      return;
    }

    setIsOptimizing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/tools/glb-optimizer", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Optimization failed.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      setResult((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return {
          fileName: readFileName(response),
          url,
          sourceSize: file.size,
          optimizedSize: blob.size,
          steps: readSteps(response),
        };
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Optimization failed.");
    } finally {
      setIsOptimizing(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface-page text-label">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-5 py-8 md:px-8">
        <header className="flex flex-col gap-4 border-b border-separator pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-on-accent-tint">Asset pipeline</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal md:text-4xl">GLB Optimizer</h1>
          </div>
          <Link
            href="/admin/imports"
            className={buttonClassName({ variant: "secondary", size: "regular" })}
          >
            Import jobs
          </Link>
        </header>

        <section className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
          <div
            className={`flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center transition ${
              isDragging ? "border-accent-tint-border bg-accent-tint" : "border-separator bg-surface-secondary"
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              setSelectedFile(event.dataTransfer.files.item(0));
            }}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-accent-tint text-on-accent-tint">
              <FileArchive className="h-8 w-8" />
            </div>
            <div className="mt-5 max-w-md">
              <h2 className="text-xl font-semibold">Drop a model file</h2>
              <p className="mt-2 text-sm leading-6 text-label-secondary">
                The tool accepts `.glb` and `.gltf` files up to 80 MB and returns a browser-ready GLB.
              </p>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
              className="sr-only"
              onChange={(event) => setSelectedFile(event.target.files?.item(0) ?? null)}
            />

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button variant="secondary" size="regular" onClick={() => inputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                Select file
              </Button>
              <Button variant="primary" size="regular" onClick={optimize} disabled={!file || isOptimizing}>
                {isOptimizing ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Optimize
              </Button>
            </div>
          </div>

          <aside className="rounded-lg border border-box-border bg-surface-secondary p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold">Run</h2>
              {file && (
                <Button variant="secondary" size="icon" onClick={() => setSelectedFile(null)} aria-label="Clear file" title="Clear file">
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </div>

            <dl className="mt-5 grid grid-cols-1 gap-3 text-sm">
              <div className="rounded-md bg-tile p-3">
                <dt className="text-xs text-label-secondary">Source</dt>
                <dd className="mt-1 break-words font-medium">{file ? file.name : "No file selected"}</dd>
              </div>
              <div className="rounded-md bg-tile p-3">
                <dt className="text-xs text-label-secondary">Size</dt>
                <dd className="mt-1 font-medium">{file ? formatBytes(file.size) : "-"}</dd>
              </div>
              {result && (
                <div className="rounded-md bg-tile p-3">
                  <dt className="text-xs text-label-secondary">Optimized</dt>
                  <dd className="mt-1 font-medium">
                    {formatBytes(result.optimizedSize)}
                    {sizeDelta && (
                      <span className="ml-2 text-xs text-on-accent-tint">
                        {sizeDelta.delta >= 0 ? "-" : "+"}
                        {Math.abs(sizeDelta.percent)}%
                      </span>
                    )}
                  </dd>
                </div>
              )}
            </dl>

            {error && (
              <div className="mt-4 flex gap-3 rounded-md border border-danger-tint-border bg-danger-tint p-3 text-sm text-on-danger-tint">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {result && (
              <a
                href={result.url}
                download={result.fileName}
                className={buttonClassName({ variant: "primary", size: "regular", className: "mt-4 w-full" })}
              >
                <Download className="h-4 w-4" />
                Download GLB
              </a>
            )}

            <div className="mt-5 space-y-2">
              <h3 className="text-sm font-semibold">Pipeline</h3>
              <div className="space-y-2">
                {(result?.steps.length ? result.steps : [{ step: "waiting", success: true, details: "Ready" }]).map(
                  (step) => (
                    <div key={`${step.step}-${step.details}`} className="rounded-md bg-tile p-3 text-sm">
                      <div className="flex items-center gap-2">
                        {step.success ? (
                          <CheckCircle2 className="h-4 w-4 text-on-success-tint" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-on-warning-tint" />
                        )}
                        <span className="font-medium capitalize">{step.step}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-label-secondary">{step.details}</p>
                    </div>
                  )
                )}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
