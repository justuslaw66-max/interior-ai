export type Plan = "free" | "pro";

export const isPro = (plan?: string | null) => plan === "pro";
