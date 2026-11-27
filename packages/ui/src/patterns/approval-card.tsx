import { Button } from "@crm/ui/components/button";
import type { ReactNode } from "react";

/**
 * Changes the agent waits to make, as in comp-neo: one card names them, lists each, and has one
 * pair of buttons for all of them, so ten calls take one click. With several, each row can also
 * be approved or denied on its own. It never blocks the page: a request is a notice, not a
 * dialog.
 */
export interface ApprovalItem {
  readonly id: string;
  /** What the call does, such as "Create company". */
  readonly label: ReactNode;
  /** What it acts on, such as "SessionLab". */
  readonly detail?: ReactNode;
}

export function ApprovalCard({
  title,
  description,
  items,
  onApprove,
  onDeny,
  disabled = false,
}: {
  title: string;
  description?: ReactNode;
  items: readonly ApprovalItem[];
  /** The items to approve: all of them, or one. */
  onApprove: (ids: readonly string[]) => void;
  onDeny: (ids: readonly string[]) => void;
  disabled?: boolean;
}) {
  const all = items.map((item) => item.id);
  const several = items.length > 1;

  return (
    <section
      aria-label={title}
      data-slot="approval-card"
      className="flex min-w-0 flex-col overflow-hidden rounded-lg bg-card text-card-foreground shadow-hairline select-none"
    >
      <div className="flex min-w-0 flex-col gap-0.5 p-4">
        <p className="text-sm font-medium text-balance">{title}</p>
        {description && <p className="text-sm text-pretty text-muted-foreground">{description}</p>}
      </div>
      <ul className="flex min-w-0 flex-col border-t px-4 py-2">
        {items.map((item) => (
          <li key={item.id} className="flex min-w-0 items-center gap-2 py-1.5 text-sm">
            <span className="min-w-0 flex-1 truncate">
              {item.label}
              {item.detail && (
                <span className="text-muted-foreground select-text"> · {item.detail}</span>
              )}
            </span>
            {several && (
              <span className="flex shrink-0 gap-1">
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => onDeny([item.id])}
                >
                  Deny
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => onApprove([item.id])}
                >
                  Approve
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2 border-t px-4 py-3">
        <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onDeny(all)}>
          {several ? "Deny all" : "Deny"}
        </Button>
        <Button size="sm" disabled={disabled} onClick={() => onApprove(all)}>
          {several ? `Approve all ${items.length}` : "Approve"}
        </Button>
      </div>
    </section>
  );
}
