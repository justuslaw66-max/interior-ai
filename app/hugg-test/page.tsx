import { isQaEnabled } from "@/lib/qa";
import { notFound } from "next/navigation";
import { HeldLight } from "@/components/HeldLight";
import HuggTestClient from "./HuggTestClient";

export const dynamic = "force-dynamic";

export default function HuggTestPage() {
  const allowHuggTest = isQaEnabled();

  if (!allowHuggTest) {
    notFound();
  }

  return (
    <HeldLight>
      <HuggTestClient />
    </HeldLight>
  );
}
