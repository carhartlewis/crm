import { integrationById } from "@crm/integrations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { parseAsStringLiteral, useQueryState } from "nuqs";
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

function Connections() {
  const { session } = Route.useRouteContext();
  const search = Route.useSearch();
  const workspaceId = session.session.activeOrganizationId ?? "";
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(TABS).withDefault("connectors"));

  const { data: connections } = useSuspenseQuery(connectionsQuery(session.user.id, workspaceId));
  const { data: skills } = useSuspenseQuery(skillsQuery(session.user.id, workspaceId));

  const appName = integrationById(search.connected ?? search.app ?? "")?.name ?? "The app";
  const outcome = outcomeMessage(search, appName);

  return (
    <PageLayout page={pageById("connections")}>
      <div className="flex flex-col gap-4">
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
        <Tabs value={tab} onValueChange={(next: (typeof TABS)[number]) => void setTab(next)}>
          <TabsList>
            <TabsTrigger value="connectors">Connectors</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
          </TabsList>
          <TabsContent value="connectors">
            <div className="pt-4">
              <ConnectorsPanel
                connections={connections}
                userId={session.user.id}
                workspaceId={workspaceId}
              />
            </div>
          </TabsContent>
          <TabsContent value="skills">
            <div className="pt-4">
              <SkillsPanel userId={session.user.id} workspaceId={workspaceId} skills={skills} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}
