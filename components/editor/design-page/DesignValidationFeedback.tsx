import type { ConstraintResult } from "@/lib/constraints/evaluate";

export type DesignValidationFeedbackProps = {
  hidden: boolean;
  constraints: ConstraintResult[];
  confidence: string | null;
};

export function DesignValidationFeedback({
  hidden,
  constraints,
  confidence,
}: DesignValidationFeedbackProps) {
  if (hidden) return null;

  return (
    <>
      {constraints.length > 0 && (
        <div
          data-testid="constraint-feedback"
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 transform animate-fade-in"
        >
          <div className="flex items-center gap-2">
            {constraints.map((item) => (
              <div
                key={item.id}
                className={`rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${
                  item.level === "ok"
                    ? "bg-green-600 text-white"
                    : item.level === "warn"
                      ? "bg-orange-500 text-white"
                      : "bg-red-600 text-white"
                }`}
              >
                {item.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {confidence && (
        <div
          data-testid="layout-confidence"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transform animate-fade-in"
        >
          <div className="rounded-full bg-neutral-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur">
            {confidence}
          </div>
        </div>
      )}
    </>
  );
}
