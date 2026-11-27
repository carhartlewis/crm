import { Button } from "@crm/ui/components/button";
import { desktopBridge } from "@crm/core/desktop";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@crm/ui/components/card";
import { type Access, integrationById, integrations, type Integration } from "@crm/integrations";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageLayout } from "../../../components/shell/page.tsx";
import {
  type Connection,
  connectMutation,
  connectionsQuery,
  disconnectMutation,
  outcomeMessage,
  setAccessMutation,
} from "../../../lib/connections.ts";
import { pageById } from "../../../lib/pages.ts";

export const Route = createLazyFileRoute("/_authed/_workspace/connections")({
  component: Connections,
});

const accessLabels: Record<Access, string> = { read: "Read", write: "Read and write" };

const onError = (error: Error) => toast.error(error.message);

function Connections() {
  const { session } = Route.useRouteContext();
  const search = Route.useSearch();

  const { data: connections } = useSuspenseQuery(
    connectionsQuery(session.user.id, session.session.activeOrganizationId ?? ""),
  );

  const byIntegration = new Map(connections.map((entry) => [entry.integration, entry]));
  const appName = integrationById(search.connected ?? search.app ?? "")?.name ?? "The app";
  const outcome = outcomeMessage(search, appName);

  return (
    <PageLayout page={pageById("connections")}>
      <div className="flex flex-col gap-3">
        {outcome ? (
          <output
            className={`flex items-center justify-between gap-3 text-sm ${outcome.ok ? "text-foreground" : "text-destructive"}`}
          >
            {outcome.text}
            <Link to="/connections" search={{}} replace className="text-muted-foreground">
              Dismiss
            </Link>
          </output>
        ) : null}
        <p className="text-sm text-muted-foreground select-none">
          The assistant can use the apps you connect. Read lets it look things up; read and write
          also lets it act, and it asks you before each action.
        </p>
        {integrations.map((integration) => (
          <IntegrationCard
            key={integration.id}
            integration={integration}
            connection={byIntegration.get(integration.id)}
          />
        ))}
      </div>
    </PageLayout>
  );
}

function IntegrationCard({
  integration,
  connection,
}: {
  integration: Integration;
  connection: Connection | undefined;
}) {
  const [choice, setChoice] = useState<Access>("read");
  const connect = useMutation({ ...connectMutation, onError });
  const setAccess = useMutation({ ...setAccessMutation, onError });

  const disconnect = useMutation({
    ...disconnectMutation,
    onError,
    onSuccess: () => toast(`${integration.name} is disconnected.`),
  });

  // While a change is in flight, show the level being saved.
  const access = setAccess.isPending ? setAccess.variables.access : connection?.access;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{integration.name}</CardTitle>
        <CardDescription>
          {connection ? `Connected · ${accessLabels[connection.access]}` : integration.summary}
        </CardDescription>
        <CardAction>
          <div className="flex items-center gap-2">
            <AccessChoice
              label={`${integration.name} access`}
              value={access ?? choice}
              disabled={setAccess.isPending || disconnect.isPending}
              onChange={(next) =>
                connection
                  ? setAccess.mutate({ integration: integration.id, access: next })
                  : setChoice(next)
              }
            />
            {connection ? (
              <Button
                variant="ghost"
                onClick={() => disconnect.mutate(integration.id)}
                loading={disconnect.isPending}
              >
                Disconnect
              </Button>
            ) : (
              // On the web, success means the page is leaving for the app's sign-in: keep the
              // spinner. The desktop app stays put while the system browser signs in.
              <Button
                onClick={() => connect.mutate({ integration: integration.id, access: choice })}
                loading={connect.isPending || (connect.isSuccess && !desktopBridge())}
              >
                Connect
              </Button>
            )}
          </div>
        </CardAction>
      </CardHeader>
    </Card>
  );
}

/** Two-way choice between read and read-and-write. */
function AccessChoice({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: Access;
  disabled: boolean;
  onChange: (access: Access) => void;
}) {
  return (
    <fieldset aria-label={label} className="flex items-center gap-1">
      {(["read", "write"] as const).map((option) => (
        <Button
          key={option}
          size="sm"
          variant={value === option ? "secondary" : "ghost"}
          aria-pressed={value === option}
          disabled={disabled}
          onClick={() => value !== option && onChange(option)}
        >
          {accessLabels[option]}
        </Button>
      ))}
    </fieldset>
  );
}
