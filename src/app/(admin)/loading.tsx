export default function AdminLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-stamp animate-pulse" />
        <div className="font-mono text-xs text-ink-soft uppercase tracking-wider">Loading...</div>
      </div>
    </div>
  );
}
