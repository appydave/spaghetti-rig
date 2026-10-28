/** An error message stays on screen this long. */
const ERROR_TOAST_MS = 8000;

export function showError(message: string, cause?: unknown) {
  console.error(cause ?? message);

  const el = document.createElement("div");

  el.className = "error";
  el.textContent = `Something broke: ${message}`;
  document.body.append(el);
  setTimeout(() => el.remove(), ERROR_TOAST_MS);
}

/** Any error or unhandled rejection on the page shows the banner. */
export function installErrorBanner() {
  addEventListener("error", (e) =>
    showError(e.error instanceof Error ? e.error.message : e.message, e.error),
  );
  addEventListener("unhandledrejection", (e) =>
    showError(
      e.reason instanceof Error ? e.reason.message : String(e.reason),
      e.reason,
    ),
  );
}
