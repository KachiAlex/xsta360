import Link from "next/link";

export default function CardNotFound() {
  return (
    <main className="min-h-full flex flex-col items-center justify-center p-6 bg-paper text-ink">
      <div className="text-center max-w-sm">
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-lg font-medium mb-4">Contact card not found</p>
        <p className="text-ink-soft mb-8">
          The link you followed may have expired, or the card may have been deactivated.
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 rounded bg-ink text-paper font-semibold hover:bg-ink-soft transition-colors"
        >
          Back to Xsta360
        </Link>
      </div>
    </main>
  );
}
