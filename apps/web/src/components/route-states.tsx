import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { OnboardingShell } from "./onboarding-shell.tsx";

/** Shown after `pendingMs` (1s) while a route's guards and data load. Announced politely. */
export function RoutePending() {
  return (
    <main className="flex min-h-svh animate-fade items-center justify-center">
      <div className="app-region-drag fixed inset-x-0 top-0 h-10" />
      <output aria-live="polite">
        <Spinner />
        <span className="sr-only">Loading</span>
      </output>
    </main>
  );
}

/** A route's data failed to load (e.g. the API is down). Never redirects; offers a retry. */
export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const retry = useMutation({ mutationFn: () => router.invalidate() });
  const offline = !navigator.onLine;

  return (
    <OnboardingShell title={offline ? "You're offline" : "Something went wrong"}>
      <div className="flex w-full flex-col items-center gap-6">
        <p role="alert" className="max-w-md text-balance text-muted-foreground">
          {offline
            ? "Reconnect to the internet, then try again."
            : `${error instanceof Error && error.message ? error.message : "CRM couldn't load this page."} Try again in a moment.`}
        </p>
        <Button size="hero" onClick={() => retry.mutate()} loading={retry.isPending}>
          Try again
        </Button>
      </div>
    </OnboardingShell>
  );
}

export function RouteNotFound() {
  return (
    <OnboardingShell title="Page not found">
      <Button size="hero" render={<Link to="/" replace />}>
        Back to CRM
      </Button>
    </OnboardingShell>
  );
}
