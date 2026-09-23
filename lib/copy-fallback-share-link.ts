/** Copy feedback belongs to the settled clipboard operation, including rejection. */
export async function copyFallbackShareLinkWithFeedback(
  url: string,
  signal: AbortSignal,
  setSuccess: (copied: boolean) => void,
  setError: (message: string | null) => void,
) {
  if (signal.aborted) return;
  let timer: ReturnType<typeof setTimeout> | undefined = undefined;
  const clearFeedback = () => {
    clearTimeout(timer);
    setSuccess(false);
    setError(null);
    signal.removeEventListener("abort", clearFeedback);
  };
  signal.addEventListener("abort", clearFeedback, { once: true });
  setSuccess(false);
  setError(null);
  try {
    await navigator.clipboard.writeText(url);
    if (signal.aborted) return;
    setSuccess(true);
  } catch {
    if (signal.aborted) return;
    setError("Unable to copy share link. Select the link and copy it manually.");
  }
  timer = setTimeout(clearFeedback, 3000);
}
