export type GuestSavePromptDialogProps = {
  open: boolean;
  onNotNow: () => void;
  onSaveAndContinue: () => void | Promise<void>;
};

export function GuestSavePromptDialog({
  open,
  onNotNow,
  onSaveAndContinue,
}: GuestSavePromptDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-lg">
        <div className="text-lg font-semibold">Save and sync this design?</div>
        <div className="mt-2 text-sm text-neutral-600">
          We will save this design so it shows up on your account after login.
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            className="rounded-xl bg-neutral-200 px-4 py-2 text-sm"
            onClick={onNotNow}
          >
            Not now
          </button>
          <button
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white"
            onClick={onSaveAndContinue}
          >
            Save and continue
          </button>
        </div>
      </div>
    </div>
  );
}
