import { isQaEnabled } from "@/lib/qa";
import { notFound } from "next/navigation";
import HuggTestClient from "./HuggTestClient";

export const dynamic = "force-dynamic";

export default function HuggTestPage() {
  const allowHuggTest = isQaEnabled();

  if (!allowHuggTest) {
    notFound();
  }

  return <HuggTestClient />;
}
