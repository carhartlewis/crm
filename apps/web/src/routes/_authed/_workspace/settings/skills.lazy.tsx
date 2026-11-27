import add from "@carbon/icons/es/add/16.js";
import chevronDown from "@carbon/icons/es/chevron--down/16.js";
import edit from "@carbon/icons/es/edit/16.js";
import upload from "@carbon/icons/es/upload/16.js";
import { parseSkillMarkdown, toSkillName } from "@crm/integrations";
import { Button } from "@crm/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { carbonIcon } from "@crm/ui/components/icon";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import { ListSearch } from "@crm/ui/patterns/data-table/list-search";
import { useLiveSuspenseQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { createLazyFileRoute, useLocation } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import {
  CreateSkillSheet,
  EMPTY_SKILL,
  type SkillDraft,
} from "../../../../components/connections/create-skill-sheet.tsx";
import { SkillsPanel } from "../../../../components/connections/skills-panel.tsx";
import { SettingsPage } from "../../../../components/settings/settings-page.tsx";
import { workspaceQuery } from "../../../../lib/session.ts";
import { skillsCollection, toSkillItem } from "../../../../lib/skills.ts";

export const Route = createLazyFileRoute("/_authed/_workspace/settings/skills")({
  component: WorkspaceSkills,
});

const AddIcon = carbonIcon(add);
const ChevronIcon = carbonIcon(chevronDown);
const EditIcon = carbonIcon(edit);
const UploadIcon = carbonIcon(upload);

const VIEWS = ["yours", "discover"] as const;

const ADD_KINDS = ["skill"] as const;

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

/**
 * Skills shared by everyone in the workspace, with one toolbar: whose, and a search (the data
 * table's `ListSearch`, nuqs `?q=`). The workspace's own skills filter on every keystroke.
 * Discover searches skills.sh with the URL's value instead: nuqs writes it after a pause in
 * typing, so a search doesn't go out per keystroke.
 */
function WorkspaceSkills() {
  const { session } = Route.useRouteContext();
  const workspaceId = session.session.activeOrganizationId ?? "";
  const [chosenView, setView] = useQueryState("view", parseAsStringLiteral(VIEWS));
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

  // Synced rows (loaded by the route loader), read and filtered locally.
  const skillRows = skillsCollection(workspaceId);

  const { data: skillData } = useLiveSuspenseQuery({
    query: (q) => q.from({ skill: skillRows }),
  });

  // Authors' names come from the workspace's members, which the shell already loads.
  const { data: workspace } = useQuery(workspaceQuery(session.user.id, workspaceId));
  const names = new Map(workspace?.members.map((member) => [member.userId, member.user.name]));
  const skills = skillData.map((skill) => toSkillItem(skill, names));

  // Without a `?view=`, a workspace with no skills opens on Discover. Decided from what it had on
  // arrival, so removing the last one doesn't swap the view out from under you.
  const [emptyOnArrival] = useState(() => skills.length === 0);
  const view = chosenView ?? (emptyOnArrival ? "discover" : "yours");

  const actions = (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" />}>
        <AddIcon />
        Add
        <ChevronIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    // The skills table fills the page and pages what fits.
    <SettingsPage title="Workspace Skills" fill actions={actions}>
      <SkillsPanel
        userId={session.user.id}
        workspaceId={workspaceId}
        skills={skills}
        view={view}
        settledQuery={settledQuery}
        toolbar={{
          tabs: (
            <Tabs value={view} onValueChange={(next: (typeof VIEWS)[number]) => void setView(next)}>
              <TabsList aria-label="Whose">
                <TabsTrigger value="yours">Yours</TabsTrigger>
                <TabsTrigger value="discover">Discover</TabsTrigger>
              </TabsList>
            </Tabs>
          ),
          search: <ListSearch placeholder="Search skills…" />,
        }}
      />
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
      {adding === "skill" ? (
        <CreateSkillSheet
          key={`${draft.name}:${draft.content.length}`}
          workspaceId={workspaceId}
          initial={draft}
          onClose={() => void setAdding(null)}
          onCreated={(id) => {
            void setAdding(null);
            void setView("yours");
            void setOpenSkill(id);
          }}
        />
      ) : null}
    </SettingsPage>
  );
}
