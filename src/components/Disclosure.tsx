import { useEffect, useState, type ReactNode } from "react";

interface DisclosureProps {
  summary: ReactNode;
  /** Opens the section when it becomes true (e.g. it has content), but never
   * closes it on its own -- clearing a field mid-typing mustn't collapse it. */
  autoOpen?: boolean;
  children: ReactNode;
}

export default function Disclosure({ summary, autoOpen = false, children }: DisclosureProps) {
  const [open, setOpen] = useState(autoOpen);
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);
  return (
    <details className="disclosure" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{summary}</summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}
