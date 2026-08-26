export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold mb-1.5 text-ink-soft">
      {children}
    </label>
  );
}

const inputBase =
  "w-full font-sans text-sm px-3 py-2.5 border border-rule rounded bg-paper focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-colors";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} className={`${inputBase} resize-vertical ${props.className ?? ""}`} />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${inputBase} ${props.className ?? ""}`} />
  );
}
