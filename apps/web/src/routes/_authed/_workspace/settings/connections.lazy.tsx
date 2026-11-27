import add from "@carbon/icons/es/add/16.js";
import { Button } from "@crm/ui/components/button";
import { carbonIcon } from "@crm/ui/components/icon";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import { ListSearch } from "@crm/ui/patterns/data-table/list-search";
import { useLiveSuspenseQuery } from "@tanstack/react-db";
import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { AddConnectorSheet } from "../../../../components/connections/add-connector-sheet.tsx";
import { ConnectorsPanel } from "../../../../components/connections/connectors-panel.tsx";
import { ConnectionsToolbar } from "../../../../components/connections/connections-toolbar.tsx";
import { SettingsPage } from "../../../../components/settings/settings-page.tsx";
import {
  catalogOf,
  connectionsCollection,
  customConnectorsCollection,
  outcomeMessage,
} from "../../../../lib/connections.ts";

export const Route = createLazyFileRoute("/_authed/_workspace/settings/connections")({
  component: Connections,
});

const AddIcon = carbonIcon(add);

const VIEWS = ["yours", "discover"] as const;

const ADD_KINDS = ["connector"] as const;

/**
 * Connected apps and custom connectors, with one toolbar: whose, and a search (the data table's
 * `ListSearch`, nuqs `?q=`), filtered locally on every keystroke.
 */
function Connections() {
  const { session } = Route.useRouteContext();
  const search = Route.useSearch();
  const workspaceId = session.session.activeOrganizationId ?? "";
  const [chosenView, setView] = useQueryState("view", parseAsStringLiteral(VIEWS));
  const [query] = useQueryState("q", parseAsString.withDefault(""));
  const [adding, setAdding] = useQueryState("add", parseAsStringLiteral(ADD_KINDS));

  // Synced rows (loaded by the route loader), read and filtered locally.
  const connectionRows = connectionsCollection(workspaceId);
  const customRows = customConnectorsCollection(workspaceId);

  const { data: connections } = useLiveSuspenseQuery({
    query: (q) => q.from({ connection: connectionRows }),
  });

  const { data: custom } = useLiveSuspenseQuery({
    query: (q) =>
      q.from({ connector: customRows }).orderBy(({ connector }) => connector.created_at, "asc"),
  });

  const catalog = catalogOf(custom);

  // Without a `?view=`, nothing connected opens on Discover. Decided from what you had on
  // arrival, so removing your last one doesn't swap the view out from under you.
  const [emptyOnArrival] = useState(() => connections.length === 0);
  const view = chosenView ?? (emptyOnArrival ? "discover" : "yours");

  const returned = search.connected ?? search.app ?? "";
  const appName = catalog.find((entry) => entry.id === returned)?.name ?? "The app";
  const outcome = outcomeMessage(search, appName);

  return (
    <SettingsPage
      title="Connections"
      wide
      actions={
        <Button size="sm" onClick={() => void setAdding("connector")}>
          <AddIcon />
          Add a custom connector
        </Button>
      }
    >
      {outcome ? (
        <output
          className={`flex items-center justify-between gap-3 text-sm ${outcome.ok ? "text-foreground" : "text-destructive"}`}
        >
          {outcome.text}
          <Link to="/settings/connections" search={{}} replace className="text-muted-foreground">
            Dismiss
          </Link>
        </output>
      ) : null}
      <ConnectionsToolbar
        tabs={
          <Tabs value={view} onValueChange={(next: (typeof VIEWS)[number]) => void setView(next)}>
            <TabsList aria-label="Whose">
              <TabsTrigger value="yours">Yours</TabsTrigger>
              <TabsTrigger value="discover">Discover</TabsTrigger>
            </TabsList>
          </Tabs>
        }
        search={<ListSearch placeholder="Search connectors…" />}
      />
      <ConnectorsPanel
        catalog={catalog}
        connections={connections}
        customConnectors={custom}
        userId={session.user.id}
        workspaceId={workspaceId}
        view={view}
        query={query}
      />
      {adding === "connector" ? (
        <AddConnectorSheet workspaceId={workspaceId} onClose={() => void setAdding(null)} />
      ) : null}
    </SettingsPage>
  );
}
