import add from "@carbon/icons/es/add/16.js";
import overflow from "@carbon/icons/es/overflow-menu--horizontal/16.js";
import type { SkillsShResult, SkillSummary } from "@crm/core/api";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { carbonIcon } from "@crm/ui/components/icon";
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
import { parseAsString, useQueryState } from "nuqs";
import { toast } from "sonner";
import {
  discoverQuery,
  installSkillMutation,
  removeSkillMutation,
  setSkillEnabledMutation,
  skillQuery,
} from "../../lib/skills.ts";
import { SectionHeading } from "./connectors-panel.tsx";

const AddIcon = carbonIcon(add);
const MoreIcon = carbonIcon(overflow);

const onError = (error: Error) => toast.error(error.message);

interface Scope {
  readonly userId: string;
  readonly workspaceId: string;
}

/**
 * Skills shared by everyone in the workspace. "Yours" lists them, filtered by `query` as you
 * type; "Discover" searches skills.sh with `settledQuery` (the URL value, which waits for a pause
 * in typing). An added skill starts disabled: open it (`?skill=<id>`), read it, then enable it.
 */
export function SkillsPanel({
  userId,
  workspaceId,
  skills,
  view,
  query,
  settledQuery,
}: Scope & {
  skills: readonly SkillSummary[];
  view: "yours" | "discover";
  query: string;
  settledQuery: string;
}) {
  const [open, setOpen] = useQueryState("skill", parseAsString);
  const scope = { userId, workspaceId };

  return (
    <>
      {view === "yours" ? (
        <YourSkills skills={skills} query={query} onOpen={(id) => void setOpen(id)} />
      ) : (
        <DiscoverSkills scope={scope} query={settledQuery} onOpen={(id) => void setOpen(id)} />
      )}
      {open ? (
        <SkillSheet key={open} scope={scope} id={open} onClose={() => void setOpen(null)} />
      ) : null}
    </>
  );
}

function YourSkills({
  skills,
  query,
  onOpen,
}: {
  skills: readonly SkillSummary[];
  query: string;
  onOpen: (id: string) => void;
}) {
  const needle = query.trim().toLowerCase();

  const shown = skills.filter((skill) =>
    `${skill.name} ${skill.description}`.toLowerCase().includes(needle),
  );

  return (
    <section className="flex flex-col gap-2">
      <SectionHeading count={shown.length}>Shared in this workspace</SectionHeading>
      {shown.length === 0 && needle ? (
        <p className="text-sm text-muted-foreground">No skills match “{query.trim()}”.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {shown.map((skill) => (
            <SkillRow key={skill.id} skill={skill} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
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
        aria-label={`Read ${skill.name}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
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
        <DropdownMenuContent align="end">
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

function DiscoverSkills({
  scope,
  query,
  onOpen,
}: {
  scope: Scope;
  query: string;
  onOpen: (id: string) => void;
}) {
  const text = query.trim();
  const results = useQuery(discoverQuery(scope.userId, scope.workspaceId, text));
  const found = results.data ?? [];

  return (
    <section className="flex flex-col gap-2">
      <SectionHeading count={found.length}>{text ? "Results" : "Top skills"}</SectionHeading>
      {results.isError ? <p className="text-sm text-destructive">{results.error.message}</p> : null}
      {results.isSuccess && found.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {text ? `No skills match “${text}”.` : "No skills to show right now."}
        </p>
      ) : null}
      <ul className="flex flex-col divide-y divide-border">
        {found.map((result) => (
          <DiscoverRow key={result.id} result={result} onOpen={onOpen} />
        ))}
      </ul>
    </section>
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
      <span className="flex min-w-0 flex-1 flex-col select-none">
        <span className="font-medium">{result.name}</span>
        <span className="truncate text-sm text-muted-foreground">
          from {result.source} · {result.installs.toLocaleString()} installs
        </span>
      </span>
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
              {detail.sourceId
                ? `from ${detail.sourceId.split("/").slice(0, -1).join("/")}`
                : "Written in this workspace"}
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
