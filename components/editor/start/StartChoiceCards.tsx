"use client";

import { FileUp, LayoutTemplate, Lock, PencilRuler, Square, type LucideIcon } from "lucide-react";
import { START_UPLOAD_CHOICE_ID } from "@/components/editor/start/UploadSignInDialog";

type StartChoice = {
  id: "templates" | "draw" | "upload" | "blank";
  title: string;
  description: string;
  icon: LucideIcon;
};

const START_CHOICES: readonly StartChoice[] = [
  { id: "templates", title: "Templates", description: "Start from a ready-made home, then adjust the sizes.", icon: LayoutTemplate },
  { id: "draw", title: "Draw room", description: "Draw the walls to the size of your room.", icon: PencilRuler },
  { id: "upload", title: "Upload floor plan", description: "Trace your home from a PDF or an image.", icon: FileUp },
  { id: "blank", title: "Blank room", description: "One empty room. Set its size, then furnish it.", icon: Square },
];

type StartChoiceCardsProps = {
  isAuthenticated: boolean;
  /** Templates only scrolls, so it never waits. */
  ready: boolean;
  onTemplates: () => void;
  onDraw: () => void;
  onUpload: () => void;
  onBlank: () => void;
};

/** The four ways to begin, as in the Start a new design mockup. */
export function StartChoiceCards({ isAuthenticated, ready, onTemplates, onDraw, onUpload, onBlank }: StartChoiceCardsProps) {
  const handlers: Record<StartChoice["id"], () => void> = {
    templates: onTemplates,
    draw: onDraw,
    upload: onUpload,
    blank: onBlank,
  };
  return (
    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
      {START_CHOICES.map(({ id, title, description, icon: Icon }) => (
        <button
          key={id}
          id={id === "upload" ? START_UPLOAD_CHOICE_ID : undefined}
          type="button"
          data-testid={`start-choice-${id}`}
          disabled={!ready && id !== "templates"}
          className="flex min-h-11 items-start gap-3.5 rounded-2xl border border-neutral-200 bg-white p-4 text-left text-neutral-950 outline-none transition hover:border-neutral-400 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 lg:p-[18px]"
          onClick={handlers[id]}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-100">
            <Icon aria-hidden="true" className="h-[22px] w-[22px]" strokeWidth={1.8} />
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-base font-bold">{title}</span>
            <span className="text-sm leading-5 text-neutral-600">{description}</span>
            {id === "upload" && !isAuthenticated ? (
              <span data-testid="start-choice-upload-sign-in" className="mt-0.5 flex items-center gap-1.5 text-[13px] text-neutral-600">
                <Lock aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
                Sign in needed
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}
