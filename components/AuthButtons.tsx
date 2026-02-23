"use client";

import { signIn, signOut } from "next-auth/react";

export function AuthButtons({ isAuthed }: { isAuthed: boolean }) {
  return (
    <div className="flex gap-2">
      {isAuthed ? (
        <button
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow-md hover:bg-neutral-50 border border-neutral-200"
          onClick={() => signOut()}
        >
          Sign out
        </button>
      ) : (
        <button
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-blue-700 border border-blue-700"
          onClick={() => signIn("google")}
        >
          Sign in with Google
        </button>
      )}
    </div>
  );
}
