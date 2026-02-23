"use client";

import { InviteCopyButton } from "@/components/InviteCopyButton";
import { useMe } from "@/hooks/useMe";

export function InviteLinkInline({ source }: { source: string }) {
  const { me } = useMe();

  if (!me || !('referralCode' in me) || typeof me.referralCode !== 'string') return null;

  return (
    <div className="mt-2 text-xs text-neutral-500">
      <button
        className="underline"
        onClick={() => {
          const btn = document.getElementById("invite-inline-button");
          if (btn) btn.click();
        }}
      >
        Invite someone to view or try
      </button>
      <span className="sr-only">
        <InviteCopyButton
          referralCode={me.referralCode}
          source={source}
        />
      </span>
    </div>
  );
}
