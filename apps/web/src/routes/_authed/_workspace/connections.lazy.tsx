import add from "@carbon/icons/es/add/16.js";
import chevronDown from "@carbon/icons/es/chevron--down/16.js";
import edit from "@carbon/icons/es/edit/16.js";
import upload from "@carbon/icons/es/upload/16.js";
import link from "@carbon/icons/es/link/16.js";
import { parseSkillMarkdown, toSkillName } from "@crm/integrations";
import { Button } from "@crm/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { carbonIcon } from "@crm/ui/components/icon";
import { Separator } from "@crm/ui/components/separator";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import { ListSearch } from "@crm/ui/patterns/data-table/list-search";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute, Link, useLocation } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { AddConnectorSheet } from "../../../components/connections/add-connector-sheet.tsx";
import { ConnectorsPanel } from "../../../components/connections/connectors-panel.tsx";
import {
  CreateSkillSheet,
  EMPTY_SKILL,
  type SkillDraft,
} from "../../../components/connections/create-skill-sheet.tsx";
import { SkillsPanel } from "../../../components/connections/skills-panel.tsx";
import { PageLayout } from "../../../components/shell/page.tsx";
import { catalogQuery, connectionsQuery, outcomeMessage } from "../../../lib/connections.ts";
import { pageById } from "../../../lib/pages.ts";
import { skillsQuery } from "../../../lib/skills.ts";

export const Route = createLazyFileRoute("/_authed/_workspace/connections")({
  component: Connections,
});

const AddIcon = carbonIcon(add);
const ChevronIcon = carbonIcon(chevronDown);
const EditIcon = carbonIcon(edit);
const UploadIcon = carbonIcon(upload);
const LinkIcon = carbonIcon(link);

const TABS = ["connectors", "skills"] as const;

const ADD_KINDS = ["skill", "connector"] as const;

/** A SKILL.md, read into the new-skill form for review. */
async function draftFromFile(file: File): Promise<SkillDraft> {
  const { fields, body } = parseSkillMarkdown(await file.text());
  const fallbackName = file.name.replace(/\.md$/i, "").replace(/^skill$/i, "");

  return {
    name: toSkillName(fields.get("name") ?? fallbackName),
    description: fields.get("description") ?? "",
    content: body,
  };
}

const VIEWS = ["yours", "discover"] as const;

/**
 * Connectors and skills, with one toolbar: what to show, whose, and a search. The search is the
 * data table's `ListSearch` (nuqs, `?q=`). Local lists filter on every keystroke. Discover
 * searches with the URL's value instead: nuqs writes it after a pause in typing, so a search
 * doesn't go out per keystroke.
 */
function Connections() {
  const { session } = Route.useRouteContext();
  const search = Route.useSearch();
  const workspaceId = session.session.activeOrganizationId ?? "";
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(TABS).withDefault("connectors"));
  const [view, setView] = useQueryState("view", parseAsStringLiteral(VIEWS).withDefault("yours"));
  const [query] = useQueryState("q", parseAsString.withDefault(""));
  const [adding, setAdding] = useQueryState("add", parseAsStringLiteral(ADD_KINDS));
  const [, setOpenSkill] = useQueryState("skill", parseAsString);
  // An uploaded file's contents, until the form saves or closes; not linkable, so not in the URL.
  const [draft, setDraft] = useState<SkillDraft>(EMPTY_SKILL);
  const fileInput = useRef<HTMLInputElement>(null);

  async function openDraft(file: File) {
    try {
      setDraft(await draftFromFile(file));
      await setAdding("skill");
    } catch {
      toast.error("That file could not be read.");
    }
  }

  const settledQuery = useLocation({
    select: (location) => new URLSearchParams(location.searchStr).get("q") ?? "",
  });

  const { data: connections } = useSuspenseQuery(connectionsQuery(session.user.id, workspaceId));
  const { data: skills } = useSuspenseQuery(skillsQuery(session.user.id, workspaceId));
  const { data: catalog } = useSuspenseQuery(catalogQuery(session.user.id, workspaceId));

  const returned = search.connected ?? search.app ?? "";
  const appName = catalog.find((entry) => entry.id === returned)?.name ?? "The app";

  // The page action: what Add does depends on the tab.
  const actions = (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" />}>
        <AddIcon />
        Add
        <ChevronIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {tab === "skills" ? (
          <>
            <DropdownMenuItem
              onClick={() => {
                setDraft(EMPTY_SKILL);
                void setAdding("skill");
              }}
            >
              <EditIcon />
              Create a skill
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => fileInput.current?.click()}>
              <UploadIcon />
              Upload a SKILL.md
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onClick={() => void setAdding("connector")}>
            <LinkIcon />
            Add a custom connector
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // What to show, whose, and the search. A table puts it on its own toolbar's line, by Sort.
  const toolbar = (
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
        <ListSearch placeholder={tab === "connectors" ? "Search connectors…" : "Search skills…"} />
      </div>
    </div>
  );

  const outcome = outcomeMessage(search, appName);

  return (
    <PageLayout page={pageById("connections")} actions={actions}>
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
        {tab === "connectors" ? toolbar : null}
        {tab === "connectors" ? (
          <ConnectorsPanel
            catalog={catalog}
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
            settledQuery={settledQuery}
            toolbar={toolbar}
          />
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".md,text/markdown"
        className="hidden"
        aria-label="Upload a SKILL.md"
        onChange={(event) => {
          const file = event.target.files?.[0];

          event.target.value = "";

          if (!file) return;

          void openDraft(file);
        }}
      />
      {adding === "connector" ? <AddConnectorSheet onClose={() => void setAdding(null)} /> : null}
      {adding === "skill" ? (
        <CreateSkillSheet
          key={`${draft.name}:${draft.content.length}`}
          initial={draft}
          onClose={() => void setAdding(null)}
          onCreated={(id) => {
            void setAdding(null);
            void setTab("skills");
            void setView("yours");
            void setOpenSkill(id);
          }}
        />
      ) : null}
    </PageLayout>
  );
}
