export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-panel border border-rule ${className}`}>{children}</div>
  );
}

export function PanelHead({
  title,
  sub,
  children,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-center px-5 py-4 border-b border-rule">
      <div>
        <h2 className="font-mono text-base m-0">{title}</h2>
        {sub && <span className="text-xs text-ink-soft font-mono">{sub}</span>}
      </div>
      {children}
    </div>
  );
}
