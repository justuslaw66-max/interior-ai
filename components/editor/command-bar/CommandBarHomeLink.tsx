"use client";

type CommandBarHomeLinkProps = {
  dark: boolean;
  /** Signed in: My designs is there to open. Guests see the name alone. */
  myDesignsAvailable: boolean;
  /** Leaves for My designs, saving a never-saved design first (UX 4c-2, Q7). */
  onOpenMyDesigns: () => void;
};

const NAME_CLASS = "hidden h-9 shrink-0 items-center rounded-lg px-2 text-base font-bold leading-none whitespace-nowrap xl:flex";

/**
 * "Interior AI" at the start of the bar, from xl (UX 4c, the approved TopBar mockup). Signed in,
 * it opens My designs the way More → My designs does, saving first; it's a link, so ⌘-click or a
 * middle click opens My designs in a new tab and leaves this design open here.
 */
export function CommandBarHomeLink({ dark, myDesignsAvailable, onOpenMyDesigns }: CommandBarHomeLinkProps) {
  const divider = <span aria-hidden="true" className="hidden h-7 w-px shrink-0 bg-neutral-200 xl:block" />;
  if (!myDesignsAvailable) {
    return (
      <>
        <span data-testid="editor-command-home" className={`${NAME_CLASS} ${dark ? "" : "text-neutral-900"}`}>Interior AI</span>
        {divider}
      </>
    );
  }
  return (
    <>
      <a
        href="/dashboard"
        data-testid="editor-command-home"
        aria-label="Interior AI, My designs"
        className={`${NAME_CLASS} no-underline ${dark ? "hover:bg-white/10" : "text-neutral-900 hover:bg-neutral-100"}`}
        onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onOpenMyDesigns();
        }}
      >
        Interior AI
      </a>
      {divider}
    </>
  );
}
