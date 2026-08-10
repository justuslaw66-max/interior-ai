"use client";

import { useEffect, useState } from "react";
import {
  consumeGuestPromptSession,
  createGuestPromptSession,
  type GuestPromptReason,
  type GuestPromptSession,
  type GuestPromptSessionIdentity,
} from "@/lib/guest-save-prompt";

type GuestPromptSnapshot = {
  session: GuestPromptSession | null;
  primaryBusy: boolean;
};

type GuestPromptControllerParameters = {
  scopeKey: string;
  claimGuestDesign: () => Promise<void>;
  requestSignIn: () => void;
};

const INITIAL_SNAPSHOT: GuestPromptSnapshot = {
  session: null,
  primaryBusy: false,
};

export class GuestSavePromptController {
  private generation = 0;
  private session: GuestPromptSession | null = null;
  private primaryBusy = false;
  private disposed = false;
  private activeScopeKey: string;

  constructor(
    private parameters: GuestPromptControllerParameters,
    private readonly publish: (snapshot: GuestPromptSnapshot) => void
  ) {
    this.activeScopeKey = parameters.scopeKey;
  }

  configure(parameters: GuestPromptControllerParameters) {
    this.parameters = parameters;
  }

  open = (reason: GuestPromptReason, continuation: () => void) => {
    if (this.session) {
      consumeGuestPromptSession(this.session, this.session, false);
    }
    this.generation += 1;
    this.primaryBusy = false;
    this.session = createGuestPromptSession(
      reason,
      this.generation,
      this.parameters.scopeKey,
      continuation
    );
    this.publishSnapshot();
  };

  cancel = (expected: GuestPromptSessionIdentity) => {
    if (this.take(expected, false) === null) return;
    this.primaryBusy = false;
    this.publishSnapshot();
  };

  continueWithoutSaving = (expected: GuestPromptSessionIdentity) => {
    const continuation = this.take(expected, true);
    if (!continuation) return;
    this.primaryBusy = false;
    this.publishSnapshot();
    continuation();
  };

  saveAndContinue = async (expected: GuestPromptSessionIdentity) => {
    if (this.primaryBusy || !this.session) return;
    const session = this.session;
    this.primaryBusy = true;
    if (this.take(expected, false) === null) {
      this.primaryBusy = false;
      return;
    }
    this.publishSnapshot();
    try {
      await this.parameters.claimGuestDesign();
      if (
        this.generation === session.generation &&
        this.parameters.scopeKey === session.scopeKey &&
        !this.disposed
      ) {
        this.parameters.requestSignIn();
      }
    } finally {
      if (this.generation === session.generation && !this.disposed) {
        this.primaryBusy = false;
        this.publishSnapshot();
      }
    }
  };

  invalidateScope(scopeKey: string) {
    if (scopeKey === this.activeScopeKey) return;
    this.activeScopeKey = scopeKey;
    this.generation += 1;
    if (this.session) {
      consumeGuestPromptSession(this.session, this.session, false);
      this.session = null;
    }
    this.primaryBusy = false;
    this.publishSnapshot();
  }

  dispose() {
    this.disposed = true;
    this.generation += 1;
    if (this.session) {
      consumeGuestPromptSession(this.session, this.session, false);
      this.session = null;
    }
    this.primaryBusy = false;
  }

  snapshotForScope(scopeKey: string): GuestPromptSnapshot {
    return {
      session: this.session?.scopeKey === scopeKey ? this.session : null,
      primaryBusy: this.primaryBusy,
    };
  }

  private take(
    expected: GuestPromptSessionIdentity,
    executeContinuation: boolean
  ) {
    const session = this.session;
    if (!session) return null;
    const continuation = consumeGuestPromptSession(
      session,
      expected,
      executeContinuation
    );
    if (continuation === null) return null;
    this.session = null;
    return continuation;
  }

  private publishSnapshot() {
    if (!this.disposed) this.publish(this.snapshotForScope(this.parameters.scopeKey));
  }
}

export function useGuestSavePromptController(
  parameters: GuestPromptControllerParameters
) {
  const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT);
  const [controller] = useState(
    () => new GuestSavePromptController(parameters, setSnapshot)
  );
  controller.configure(parameters);
  useEffect(() => {
    controller.invalidateScope(parameters.scopeKey);
  }, [controller, parameters.scopeKey]);
  useEffect(() => () => controller.dispose(), [controller]);
  return {
    snapshot: controller.snapshotForScope(parameters.scopeKey).session
      ? snapshot
      : { ...snapshot, session: null },
    open: controller.open,
    cancel: controller.cancel,
    continueWithoutSaving: controller.continueWithoutSaving,
    saveAndContinue: controller.saveAndContinue,
  };
}
