import { desktopBridge } from "@crm/core/desktop";
import { Button } from "@crm/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { GoogleMark } from "../components/google-mark.tsx";
import { OnboardingShell } from "../components/onboarding-shell.tsx";
import { authClient } from "../lib/auth.ts";
import { resetAuth, safeRedirect, sessionQuery } from "../lib/session.ts";

/** `redirect` is optional, so links to /sign-in needn't pass search params. */
interface SignInSearch {
  redirect?: string;
}

export const Route = createFileRoute("/sign-in")({
  // Parsed by hand (no schema library in the cold-entry bundle for one param).
  validateSearch: (search: { redirect?: string | number | boolean | null }): SignInSearch => {
    const raw = search.redirect;
    const redirectTo = safeRedirect(raw === undefined || raw === null ? undefined : String(raw));
    const result: SignInSearch = {};

    if (redirectTo) result.redirect = redirectTo;

    return result;
  },
  beforeLoad: async ({ context, search }) => {
    if (await context.queryClient.fetchQuery(sessionQuery)) {
      throw redirect({ href: search.redirect ?? "/", replace: true });
    }
  },
  component: SignIn,
});

function SignIn() {
  const { redirect: returnTo = "/" } = Route.useSearch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  const signIn = async () => {
    setPending(true);

    try {
      const desktop = desktopBridge();

      if (!desktop) {
        // Web: the browser leaves for Google; keep the spinner until it does.
        const { error } = await authClient.signIn.social({
          provider: "google",
          callbackURL: new URL(returnTo, window.location.origin).href,
          errorCallbackURL: new URL("/sign-in", window.location.origin).href,
        });

        if (error) throw new Error(error.message ?? "Couldn't start Google sign-in");

        return;
      }

      // Electron: Google signs in in the system browser (RFC 8252). Redeem the single-use code
      // with the PKCE verifier only this app holds; the server creates this window's session.
      const handoff = await desktop.signInWithGoogle();

      const { error } = await authClient.$fetch("/desktop/redeem", {
        method: "POST",
        body: handoff,
      });

      if (error) throw new Error(error.message ?? "Sign-in could not be completed");

      await resetAuth(queryClient);
      await navigate({ href: returnTo, replace: true });
    } catch (error) {
      setPending(false);
      toast.error(error instanceof Error ? error.message : "Sign-in failed");
    }
  };

  return (
    <OnboardingShell title="The CRM where relationships compound">
      <div className="flex w-full flex-col items-center gap-6">
        <Button size="hero" onClick={signIn} loading={pending}>
          <GoogleMark />
          Sign in with Google
        </Button>
        <p className="max-w-md text-sm text-balance text-muted-foreground">
          By continuing you agree to the Terms of Service and acknowledge the Privacy Policy.
        </p>
      </div>
    </OnboardingShell>
  );
}
