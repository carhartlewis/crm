import { integrationById } from "@crm/integrations";
import { Separator } from "@crm/ui/components/separator";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import { ListSearch } from "@crm/ui/patterns/data-table/list-search";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute, Link, useLocation } from "@tanstack/react-router";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { ConnectorsPanel } from "../../../components/connections/connectors-panel.tsx";
import { SkillsPanel } from "../../../components/connections/skills-panel.tsx";
import { PageLayout } from "../../../components/shell/page.tsx";
import { connectionsQuery, outcomeMessage } from "../../../lib/connections.ts";
import { pageById } from "../../../lib/pages.ts";
import { skillsQuery } from "../../../lib/skills.ts";

export const Route = createLazyFileRoute("/_authed/_workspace/connections")({
  component: Connections,
});

const TABS = ["connectors", "skills"] as const;

const VIEWS = ["yours", "discover"] as const;

/**
 * Connectors and skills, with one toolbar: what to show, whose, and a search. The search is the
 * data table's `ListSearch` (`?q=`); local lists filter on every keystroke, and skills.sh is
 * searched with the URL's value, which follows the field after a pause in typing.
 */
function Connections() {
  const { session } = Route.useRouteContext();
  const search = Route.useSearch();
  const workspaceId = session.session.activeOrganizationId ?? "";
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(TABS).withDefault("connectors"));
  const [view, setView] = useQueryState("view", parseAsStringLiteral(VIEWS).withDefault("yours"));
  const [query] = useQueryState("q", parseAsString.withDefault(""));

  const settledQuery = useLocation({
    select: (location) => new URLSearchParams(location.searchStr).get("q") ?? "",
  });

  const { data: connections } = useSuspenseQuery(connectionsQuery(session.user.id, workspaceId));
  const { data: skills } = useSuspenseQuery(skillsQuery(session.user.id, workspaceId));

  const appName = integrationById(search.connected ?? search.app ?? "")?.name ?? "The app";
  const outcome = outcomeMessage(search, appName);

  return (
    <PageLayout page={pageById("connections")}>
      <div className="flex flex-col gap-6">
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
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={tab} onValueChange={(next: (typeof TABS)[number]) => void setTab(next)}>
            <TabsList aria-label="Show">
              <TabsTrigger value="connectors">Connectors</TabsTrigger>
              <TabsTrigger value="skills">Skills</TabsTrigger>
            </TabsList>
          </Tabs>
          <Separator orientation="vertical" className="h-5" />
          <Tabs value={view} onValueChange={(next: (typeof VIEWS)[number]) => void setView(next)}>
            <TabsList aria-label="Whose">
              <TabsTrigger value="yours">Yours</TabsTrigger>
              <TabsTrigger value="discover">Discover</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="min-w-48 flex-1 sm:max-w-80">
            <ListSearch
              placeholder={
                tab === "connectors"
                  ? "Search connectors…"
                  : view === "discover"
                    ? "Search skills.sh…"
                    : "Search skills…"
              }
            />
          </div>
        </div>
        {tab === "connectors" ? (
          <ConnectorsPanel
            connections={connections}
            userId={session.user.id}
            workspaceId={workspaceId}
            view={view}
            query={query}
          />
        ) : (
          <SkillsPanel
            userId={session.user.id}
            workspaceId={workspaceId}
            skills={skills}
            view={view}
            query={query}
            settledQuery={settledQuery}
          />
        )}
      </div>
    </PageLayout>
  );
}
