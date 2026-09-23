export type CabinetNumberDraftIssueCode =
  | "empty"
  | "incomplete"
  | "invalid_syntax"
  | "non_finite"
  | "below_minimum"
  | "above_maximum"
  | "integer_required"
  | "step_mismatch";

export type CabinetNumberDraftValidation =
  | {
      status: "valid";
      value: number;
      normalizedDraft: string;
    }
  | {
      status: "incomplete" | "invalid";
      code: CabinetNumberDraftIssueCode;
      message: string;
    };

export interface CabinetNumberConstraints {
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  unit?: string;
}

const COMPLETE_DECIMAL_NUMBER =
  /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;
const INCOMPLETE_DECIMAL_NUMBER =
  /^(?:[+-]?|[+-]?\.|[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))[eE][+-]?)$/;

function finiteConstraint(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatConstraint(value: number, unit?: string): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 12 })}${
    unit ? ` ${unit}` : ""
  }`;
}

function followsStep(value: number, step: number, base: number): boolean {
  const quotient = (value - base) / step;
  const nearest = Math.round(quotient);
  const tolerance = Number.EPSILON * 32 * Math.max(1, Math.abs(quotient));
  return Math.abs(quotient - nearest) <= tolerance;
}

/**
 * Validates a user-authored decimal draft without coercing incomplete text to
 * zero. Hexadecimal, numeric separators, and other JavaScript-only number
 * syntax are deliberately rejected so the result matches a dimension field.
 */
export function validateCabinetNumberDraft(
  draft: string,
  constraints: CabinetNumberConstraints = {}
): CabinetNumberDraftValidation {
  const trimmed = draft.trim();
  const unit = constraints.unit;

  if (!trimmed) {
    return {
      status: "incomplete",
      code: "empty",
      message: "Enter a number before applying this change.",
    };
  }

  if (INCOMPLETE_DECIMAL_NUMBER.test(trimmed)) {
    return {
      status: "incomplete",
      code: "incomplete",
      message: "Finish entering the number before applying this change.",
    };
  }

  if (!COMPLETE_DECIMAL_NUMBER.test(trimmed)) {
    return {
      status: "invalid",
      code: "invalid_syntax",
      message: "Enter a decimal number using digits, a decimal point, or an exponent.",
    };
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return {
      status: "invalid",
      code: "non_finite",
      message: "Enter a finite number within the supported range.",
    };
  }

  const min = finiteConstraint(constraints.min);
  const max = finiteConstraint(constraints.max);
  if (min !== undefined && value < min) {
    return {
      status: "invalid",
      code: "below_minimum",
      message: `Enter ${formatConstraint(min, unit)} or more.`,
    };
  }
  if (max !== undefined && value > max) {
    return {
      status: "invalid",
      code: "above_maximum",
      message: `Enter ${formatConstraint(max, unit)} or less.`,
    };
  }

  if (constraints.integer && !Number.isInteger(value)) {
    return {
      status: "invalid",
      code: "integer_required",
      message: "Enter a whole number without a decimal fraction.",
    };
  }

  const step = finiteConstraint(constraints.step);
  if (step !== undefined && step > 0) {
    const base = min ?? 0;
    if (!followsStep(value, step, base)) {
      return {
        status: "invalid",
        code: "step_mismatch",
        message: `Use increments of ${formatConstraint(step, unit)} starting at ${formatConstraint(
          base,
          unit
        )}.`,
      };
    }
  }

  return {
    status: "valid",
    value,
    normalizedDraft: String(value),
  };
}

export interface CabinetNonFiniteNumberIssue {
  path: string;
  value: number;
}

function childObjectPath(parentPath: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${parentPath}.${key}`
    : `${parentPath}[${JSON.stringify(key)}]`;
}

/** Finds every NaN or infinite number in a nested definition-like value. */
export function findCabinetNonFiniteNumbers(
  value: unknown,
  rootPath = "definition"
): CabinetNonFiniteNumberIssue[] {
  const issues: CabinetNonFiniteNumberIssue[] = [];
  const visited = new WeakSet<object>();

  const visit = (candidate: unknown, path: string) => {
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) issues.push({ path, value: candidate });
      return;
    }
    if (!candidate || typeof candidate !== "object") return;
    if (visited.has(candidate)) return;
    visited.add(candidate);

    if (Array.isArray(candidate)) {
      candidate.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }

    Object.entries(candidate).forEach(([key, entry]) => {
      visit(entry, childObjectPath(path, key));
    });
  };

  visit(value, rootPath);
  return issues;
}

export function hasCabinetNonFiniteNumbers(value: unknown): boolean {
  return findCabinetNonFiniteNumbers(value).length > 0;
}

export function assertCabinetFiniteNumberIntegrity(
  value: unknown,
  rootPath = "definition"
): void {
  const issues = findCabinetNonFiniteNumbers(value, rootPath);
  if (!issues.length) return;
  const paths = issues.map((issue) => issue.path).join(", ");
  throw new TypeError(`Non-finite numeric values are not allowed at: ${paths}`);
}
