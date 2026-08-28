"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="font-mono text-xs text-ink-soft mb-2 uppercase tracking-wider">Something went wrong</div>
      <h2 className="font-mono text-xl mb-3">{error.message || "An unexpected error occurred"}</h2>
      <button
        type="button"
        onClick={reset}
        className="text-sm font-semibold border border-ink rounded px-4 py-2.5 hover:bg-paper-2 min-h-[44px] active:bg-paper-2"
      >
        Try again
      </button>
    </div>
  );
}
