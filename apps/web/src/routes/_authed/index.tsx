import { Button } from "@crm/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm/ui/components/card";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "../../lib/auth.ts";
import { resetAuth, sessionQuery, workspacesQuery } from "../../lib/session.ts";

export const Route = createFileRoute("/_authed/")({
  beforeLoad: async ({ context }) => {
    const { queryClient, session } = context;
    const workspaces = await queryClient.fetchQuery(workspacesQuery(session.user.id));
    const [first] = workspaces;

    if (!first) throw redirect({ to: "/setup-workspace", replace: true });

    // A session created before the user joined has no active workspace: activate their first
    // before rendering, so the page never shows a workspace the server hasn't activated.
    if (!session.session.activeOrganizationId) {
      const { error } = await authClient.organization.setActive({ organizationId: first.id });

      if (error) throw new Error(error.message ?? "Couldn't open your workspace");

      await resetAuth(queryClient);
    }
  },
  component: Home,
});

function Home() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { session } = Route.useRouteContext();
  const { data: workspaces } = useSuspenseQuery(workspacesQuery(session.user.id));
  const { data: current } = useSuspenseQuery(sessionQuery);
  const activeId = current?.session.activeOrganizationId;
  const active = workspaces.find((workspace) => workspace.id === activeId) ?? workspaces[0];
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);

    const { error } = await authClient.signOut();

    if (error) {
      setSigningOut(false);
      toast.error(error.message ?? "Couldn't sign out");

      return;
    }

    // Order matters: mark signed out, leave the guarded route, then drop every cached query.
    queryClient.setQueryData(sessionQuery.queryKey, null);
    await navigate({ to: "/sign-in", replace: true });
    queryClient.clear();
  };

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="app-region-drag fixed inset-x-0 top-0 h-10" />
      <div className="animate-enter w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle>{active?.name}</CardTitle>
            <CardDescription>{`Signed in as ${session.user.email}`}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={signOut} loading={signingOut}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
