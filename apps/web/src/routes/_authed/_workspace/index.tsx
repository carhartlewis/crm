import { Button } from "@crm/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@crm/ui/components/card";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { sessionQuery, signOutMutation, workspacesQuery } from "../../../lib/session.ts";

export const Route = createFileRoute("/_authed/_workspace/")({
  component: Home,
});

function Home() {
  const { session } = Route.useRouteContext();
  const { data: workspaces } = useSuspenseQuery(workspacesQuery(session.user.id));
  const { data: current } = useSuspenseQuery(sessionQuery);
  const activeId = current?.session.activeOrganizationId;
  const active = workspaces.find((workspace) => workspace.id === activeId) ?? workspaces[0];

  const signOut = useMutation({
    ...signOutMutation,
    onError: (error) => toast.error(error.message),
  });

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
            <Button
              variant="outline"
              onClick={() => signOut.mutate()}
              loading={signOut.isPending || signOut.isSuccess}
            >
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
