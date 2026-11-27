import add from "@carbon/icons/es/add/16.js";
import document from "@carbon/icons/es/document/16.js";
import launch from "@carbon/icons/es/launch/16.js";
import overflow from "@carbon/icons/es/overflow-menu--horizontal/16.js";
import search16 from "@carbon/icons/es/search/16.js";
import type { SkillsShResult, SkillSummary } from "@crm/core/api";
import { skillsShUrl } from "@crm/integrations";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@crm/ui/components/empty";
import { carbonIcon } from "@crm/ui/components/icon";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@crm/ui/components/input-group";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import {
  AdaptiveSheet,
  AdaptiveSheetContent,
  AdaptiveSheetDescription,
  AdaptiveSheetFooter,
  AdaptiveSheetHeader,
  AdaptiveSheetTitle,
} from "@crm/ui/patterns/adaptive-sheet";
import { FormattedDate } from "@crm/ui/patterns/formatted-date";
import { useMutation, useQuery } from "@tanstack/react-query";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { toast } from "sonner";
import {
  discoverQuery,
  installSkillMutation,
  removeSkillMutation,
  setSkillEnabledMutation,
  skillQuery,
} from "../../lib/skills.ts";

const AddIcon = carbonIcon(add);
const SkillIcon = carbonIcon(document);
const LaunchIcon = carbonIcon(launch);
const MoreIcon = carbonIcon(overflow);
const SearchIcon = carbonIcon(search16);

const VIEWS = ["yours", "discover"] as const;

const onError = (error: Error) => toast.error(error.message);

interface Scope {
  readonly userId: string;
  readonly workspaceId: string;
}

/**
 * Skills shared by everyone in the workspace. "Yours" lists them; "Discover" searches skills.sh.
 * An added skill starts disabled: open it (`?skill=<id>`), read it, then enable it.
 */
export function SkillsPanel({
  userId,
  workspaceId,
  skills,
}: Scope & { skills: readonly SkillSummary[] }) {
  const [view, setView] = useQueryState("view", parseAsStringLiteral(VIEWS).withDefault("yours"));
  const [open, setOpen] = useQueryState("skill", parseAsString);
  const scope = { userId, workspaceId };

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={view} onValueChange={(next: (typeof VIEWS)[number]) => void setView(next)}>
        <TabsList>
          <TabsTrigger value="yours">Yours</TabsTrigger>
          <TabsTrigger value="discover">Discover</TabsTrigger>
        </TabsList>
      </Tabs>
      {view === "yours" ? (
        <YourSkills skills={skills} onOpen={(id) => void setOpen(id)} />
      ) : (
        <DiscoverSkills scope={scope} onOpen={(id) => void setOpen(id)} />
      )}
      {open ? (
        <SkillSheet key={open} scope={scope} id={open} onClose={() => void setOpen(null)} />
      ) : null}
    </div>
  );
}

function YourSkills({
  skills,
  onOpen,
}: {
  skills: readonly SkillSummary[];
  onOpen: (id: string) => void;
}) {
  if (skills.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No skills yet</EmptyTitle>
          <EmptyDescription>
            Skills teach the assistant how your workspace works. Find one in Discover.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-base font-medium select-none">
        Shared in this workspace
        <Badge variant="secondary">{skills.length}</Badge>
      </h2>
      <ul className="flex flex-col divide-y divide-border">
        {skills.map((skill) => (
          <SkillRow key={skill.id} skill={skill} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}

function SkillTile() {
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-foreground/10">
      <SkillIcon />
    </div>
  );
}

function SkillRow({ skill, onOpen }: { skill: SkillSummary; onOpen: (id: string) => void }) {
  const setEnabled = useMutation({ ...setSkillEnabledMutation, onError });

  const remove = useMutation({
    ...removeSkillMutation,
    onError,
    onSuccess: () => toast(`${skill.name} is removed for everyone.`),
  });

  return (
    <li className="flex items-center gap-3 py-3">
      <button
        type="button"
        onClick={() => onOpen(skill.id)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <SkillTile />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2 font-medium">
            {skill.name}
            {skill.enabled ? null : <Badge variant="secondary">Disabled</Badge>}
          </span>
          <span className="truncate text-sm text-muted-foreground">
            {skill.addedBy ? `added by ${skill.addedBy.name} · ` : ""}
            {skill.description}
          </span>
        </span>
      </button>
      <span className="shrink-0 text-sm text-muted-foreground select-none">
        <FormattedDate value={skill.createdAt} />
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${skill.name} actions`}
              loading={setEnabled.isPending || remove.isPending}
            />
          }
        >
          <MoreIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => onOpen(skill.id)}>Read</DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setEnabled.mutate({ id: skill.id, enabled: !skill.enabled })}
          >
            {skill.enabled ? "Disable" : "Enable"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => remove.mutate(skill.id)}>
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function DiscoverSkills({ scope, onOpen }: { scope: Scope; onOpen: (id: string) => void }) {
  // The search runs when the person submits, so each keystroke doesn't call skills.sh.
  const [query, setQuery] = useQueryState("q", parseAsString.withDefault(""));
  const results = useQuery(discoverQuery(scope.userId, scope.workspaceId, query));

  return (
    <div className="flex flex-col gap-3">
      <form
        className="w-full sm:w-80"
        onSubmit={(event) => {
          event.preventDefault();
          void setQuery(String(new FormData(event.currentTarget).get("q") ?? "").trim());
        }}
      >
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            name="q"
            type="search"
            autoComplete="off"
            aria-label="Search skills.sh"
            placeholder="Search skills.sh, then press Enter"
            defaultValue={query}
          />
        </InputGroup>
      </form>
      {results.isError ? <p className="text-sm text-destructive">{results.error.message}</p> : null}
      {query.length >= 2 && results.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">No skills on skills.sh match “{query}”.</p>
      ) : null}
      <ul className="flex flex-col divide-y divide-border">
        {(results.data ?? []).map((result) => (
          <DiscoverRow key={result.id} result={result} onOpen={onOpen} />
        ))}
      </ul>
    </div>
  );
}

function DiscoverRow({ result, onOpen }: { result: SkillsShResult; onOpen: (id: string) => void }) {
  const install = useMutation({
    ...installSkillMutation,
    onError,
    onSuccess: (skill) => {
      toast(`${skill.name} is added, but off. Read it, then enable it.`);
      onOpen(skill.id);
    },
  });

  return (
    <li className="flex items-center gap-3 py-3">
      <SkillTile />
      <span className="flex min-w-0 flex-1 flex-col select-none">
        <span className="font-medium">{result.name}</span>
        <span className="truncate text-sm text-muted-foreground">
          from {result.source} · {result.installs.toLocaleString()} installs
        </span>
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`${result.name} on skills.sh`}
        render={
          <a
            href={skillsShUrl(result.id)}
            target="_blank"
            rel="noreferrer"
            aria-label={`${result.name} on skills.sh`}
          />
        }
      >
        <LaunchIcon />
      </Button>
      {result.installed ? (
        <Badge variant="secondary">Added</Badge>
      ) : (
        <Button
          variant="secondary"
          onClick={() => install.mutate(result.id)}
          loading={install.isPending}
        >
          <AddIcon />
          Add
        </Button>
      )}
    </li>
  );
}

function SkillSheet({ scope, id, onClose }: { scope: Scope; id: string; onClose: () => void }) {
  const skill = useQuery(skillQuery(scope.userId, scope.workspaceId, id));
  const setEnabled = useMutation({ ...setSkillEnabledMutation, onError });
  const remove = useMutation({ ...removeSkillMutation, onError, onSuccess: onClose });
  const detail = skill.data;

  return (
    <AdaptiveSheet open onOpenChange={(next) => (next ? undefined : onClose())} size="wide">
      <AdaptiveSheetContent>
        <AdaptiveSheetHeader>
          <AdaptiveSheetTitle>{detail?.name ?? "Skill"}</AdaptiveSheetTitle>
          <AdaptiveSheetDescription>
            {detail?.description ?? (skill.isError ? skill.error.message : "Loading…")}
          </AdaptiveSheetDescription>
        </AdaptiveSheetHeader>
        {detail ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
            <p className="text-sm text-muted-foreground select-none">
              {detail.sourceId ? (
                <a
                  className="underline underline-offset-4"
                  href={skillsShUrl(detail.sourceId)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {detail.sourceId}
                </a>
              ) : (
                "Written in this workspace"
              )}
              {detail.files.length === 1 ? " · 1 more file" : ""}
              {detail.files.length > 1 ? ` · ${detail.files.length} more files` : ""}
            </p>
            <pre className="rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap select-text">
              {detail.content}
            </pre>
          </div>
        ) : null}
        {detail ? (
          <AdaptiveSheetFooter>
            <Button
              variant="ghost"
              onClick={() => remove.mutate(detail.id)}
              loading={remove.isPending}
            >
              Remove
            </Button>
            <Button
              variant={detail.enabled ? "secondary" : "default"}
              onClick={() => setEnabled.mutate({ id: detail.id, enabled: !detail.enabled })}
              loading={setEnabled.isPending}
            >
              {detail.enabled ? "Disable for the workspace" : "Enable for the workspace"}
            </Button>
          </AdaptiveSheetFooter>
        ) : null}
      </AdaptiveSheetContent>
    </AdaptiveSheet>
  );
}
