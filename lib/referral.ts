"use client";

const REFERRAL_KEY = "referral_code";
const INVITED_KEY = "invited_by_code";

export function readReferral(): string | null {
  try {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("ref");
    if (ref) {
      localStorage.setItem(REFERRAL_KEY, ref);
      return ref;
    }
  } catch {
    // ignore URL/storage errors
  }
  return null;
}

export function getStoredReferral(): string | null {
  try {
    return localStorage.getItem(REFERRAL_KEY);
  } catch {
    return null;
  }
}

export function clearStoredReferral() {
  try {
    localStorage.removeItem(REFERRAL_KEY);
  } catch {
    // ignore storage errors
  }
}

export function setInvitedBy(code: string) {
  try {
    localStorage.setItem(INVITED_KEY, code);
  } catch {
    // ignore storage errors
  }
}

export function getInvitedBy(): string | null {
  try {
    return localStorage.getItem(INVITED_KEY);
  } catch {
    return null;
  }
}
