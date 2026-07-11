import { auth } from "@/lib/auth";
import { logAppEvent } from "@/lib/app-events";
import { createClientAppEventHandler } from "@/lib/client-app-event-handler";
import { rateLimit } from "@/lib/rateLimit";

export const POST = createClientAppEventHandler({
  authenticate: auth,
  logEvent: logAppEvent,
  checkRateLimit: rateLimit,
  skipPersistence: process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS === "1",
});
