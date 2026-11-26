import { Button } from "@crm/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { GoogleMark } from "../../components/google-mark.tsx";
import { OnboardingShell } from "../../components/onboarding-shell.tsx";
import { signInMutation } from "../../lib/session.ts";

export const Route = createFileRoute("/_guest/sign-in")({
  component: SignIn,
});

function SignIn() {
  const { redirect: returnTo = "/" } = Route.useSearch();

  const signIn = useMutation({
    ...signInMutation,
    onError: (error) => toast.error(error.message || "Sign-in failed"),
  });

  return (
    <OnboardingShell title="The CRM where relationships compound">
      <div className="flex w-full flex-col items-center gap-6">
        {/* Success means the page is leaving (for Google, or into the app): keep the spinner. */}
        <Button
          size="hero"
          onClick={() => signIn.mutate({ returnTo })}
          loading={signIn.isPending || signIn.isSuccess}
        >
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
