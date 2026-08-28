export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-panel border border-rule rounded-md px-4 sm:px-8 py-8 sm:py-14 text-center">
      <div className="font-mono text-xl sm:text-2xl text-ink-soft mb-2">—</div>
      <h3 className="font-mono text-base sm:text-lg mb-2">{title}</h3>
      <p className="text-ink-soft text-sm max-w-sm mx-auto mb-5 sm:mb-6">{description}</p>
      {action && <div className="flex justify-center">{action}</div>}
    </div>
  );
}
