"use client";

import { useEffect, useRef } from "react";
import { signIn } from "next-auth/react";
import {
  FLOOR_PLAN_UPLOAD_ENTRY_EVENT,
  FLOOR_PLAN_UPLOAD_SIGN_IN_EVENT,
  floorPlanUploadRequestOf,
  openFloorPlanUploadWindow,
  type FloorPlanUploadRequest,
} from "@/lib/floor-plan-upload-request";
import { START_UPLOAD_CALLBACK_URL } from "@/lib/start-design-link";

export type FloorPlanUploadEntryInput = {
  isAuthenticated: boolean;
  /** The session has loaded, so a member is never taken for a guest. */
  sessionKnown: boolean;
  /** Plan in 2D, for uploads that start outside Plan. */
  goPlan: () => void;
  /** Guests: "Sign in to upload your floor plan". */
  askToSignIn: (request: FloorPlanUploadRequest) => void;
};

/** Signs in with Google, then comes back to the upload window (`/design?start=upload`). */
export function signInForFloorPlanUpload() {
  void signIn("google", { callbackUrl: START_UPLOAD_CALLBACK_URL });
}

/**
 * Guests sign in before they choose a file (ST3); members get the upload window. Entries in Plan
 * open it at once; from Start a new design or a link, Plan opens first and is asked once its
 * upload section has rendered.
 */
export function answerFloorPlanUploadRequest(
  request: FloorPlanUploadRequest,
  input: FloorPlanUploadEntryInput
) {
  if (!input.isAuthenticated) return input.askToSignIn(request);
  if (request.source !== "start_chooser" && request.source !== "start_link") {
    return openFloorPlanUploadWindow(request);
  }
  input.goPlan();
  window.requestAnimationFrame(() =>
    window.requestAnimationFrame(() => openFloorPlanUploadWindow(request))
  );
}

/**
 * Answers `requestFloorPlanUpload` from anywhere in the editor, and the upload window's own
 * "Continue with Google". A request made while the session is still loading waits for it.
 */
export function useFloorPlanUploadEntry(input: FloorPlanUploadEntryInput) {
  const latest = useRef(input);
  const pending = useRef<FloorPlanUploadRequest | null>(null);
  useEffect(() => {
    latest.current = input;
  });
  useEffect(() => {
    const answer = (event: Event) => {
      const request = floorPlanUploadRequestOf(event);
      if (latest.current.sessionKnown) answerFloorPlanUploadRequest(request, latest.current);
      else pending.current = request;
    };
    window.addEventListener(FLOOR_PLAN_UPLOAD_ENTRY_EVENT, answer);
    window.addEventListener(FLOOR_PLAN_UPLOAD_SIGN_IN_EVENT, signInForFloorPlanUpload);
    return () => {
      window.removeEventListener(FLOOR_PLAN_UPLOAD_ENTRY_EVENT, answer);
      window.removeEventListener(FLOOR_PLAN_UPLOAD_SIGN_IN_EVENT, signInForFloorPlanUpload);
    };
  }, []);
  const { sessionKnown } = input;
  useEffect(() => {
    const request = pending.current;
    if (!sessionKnown || !request) return;
    pending.current = null;
    // Next frame, so the answer doesn't set state inside this effect.
    window.requestAnimationFrame(() => answerFloorPlanUploadRequest(request, latest.current));
  }, [sessionKnown]);
}
