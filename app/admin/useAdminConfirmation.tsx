"use client";

import { useState, type ReactNode } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";

export type AdminConfirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
};

/**
 * Asks before an Admin change that can't be undone (UX audit AD4): `confirm` opens the shared
 * ConfirmDialog, and the change runs only from its confirm button.
 */
export function useAdminConfirmation(): {
  confirm: (confirmation: AdminConfirmation) => void;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<AdminConfirmation | null>(null);
  const dialog = pending ? (
    <ConfirmDialog
      open
      manageBackground
      title={pending.title}
      description={pending.description}
      confirmLabel={pending.confirmLabel}
      destructive={pending.destructive}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        setPending(null);
        pending.onConfirm();
      }}
    />
  ) : null;
  return { confirm: setPending, dialog };
}
