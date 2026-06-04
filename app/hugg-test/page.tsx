import { notFound } from "next/navigation";
import HuggTestClient from "./HuggTestClient";

export const dynamic = "force-dynamic";

export default function HuggTestPage() {
  const allowHuggTest =
    process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS === "1";

  if (!allowHuggTest) {
    notFound();
  }

  return <HuggTestClient />;
}
