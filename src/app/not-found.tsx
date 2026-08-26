import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex-1 flex items-center justify-center p-10">
      <div className="text-center">
        <div className="font-mono text-6xl text-stamp mb-4">404</div>
        <h1 className="font-mono text-2xl mb-2">Page not found</h1>
        <p className="text-ink-soft mb-6">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
        <Link href="/" className="text-ink font-semibold underline underline-offset-2">
          Back to home
        </Link>
      </div>
    </main>
  );
}
