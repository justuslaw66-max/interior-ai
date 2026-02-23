"use client";

import { InviteCopyButton } from "@/components/InviteCopyButton";
import { useMe } from "@/hooks/useMe";

export function InviteFriendCTA() {
  const { me } = useMe();

  return (
    <div className="mt-4 rounded-xl border bg-neutral-50 p-3">
      <div className="text-sm font-semibold">Want a second opinion? Invite someone.</div>
      <div className="mt-2">
        <InviteCopyButton
          referralCode={me?.id ?? null}
          source="checkout_success"
        />
      </div>
    </div>
  );
}
