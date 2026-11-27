import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@crm/ui/components/card";
import type { ReactNode } from "react";

/** One setting: its title and description, the control, then a hint beside its own action. */
export function SettingsCard({
  title,
  description,
  hint,
  action,
  children,
}: {
  title: string;
  description: string;
  hint?: string;
  /** Usually the card's Save button. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
      {hint || action ? (
        <CardFooter>
          <div className="flex w-full items-center justify-between gap-4">
            <p className="min-w-0 truncate text-muted-foreground">{hint}</p>
            {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
          </div>
        </CardFooter>
      ) : null}
    </Card>
  );
}
