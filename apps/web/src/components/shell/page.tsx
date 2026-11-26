import { Card, CardDescription, CardHeader, CardTitle } from "@crm/ui/components/card";
import type { ReactNode } from "react";
import type { Page } from "../../lib/pages.ts";

/** A workspace page: its title and summary, then content. Enters in two staggered groups. */
export function PageLayout({ page, children }: { page: Page; children: ReactNode }) {
  const PageIcon = page.icon;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pt-6 pb-12">
      <header className="animate-enter flex flex-col gap-2 select-none">
        <h1 className="flex items-center gap-2 text-2xl font-medium tracking-tight">
          <PageIcon className="size-5 text-muted-foreground" />
          {page.label}
        </h1>
        <p className="text-muted-foreground">{page.description}</p>
      </header>
      <div className="animate-enter enter-delay-1">{children}</div>
    </div>
  );
}

/** What a page shows before it has records. */
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{children}</CardDescription>
      </CardHeader>
    </Card>
  );
}
