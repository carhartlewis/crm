import checkmark16 from "@carbon/icons/es/checkmark/16.js";
import chevronDown16 from "@carbon/icons/es/chevron--down/16.js";
import close16 from "@carbon/icons/es/close/16.js";
import {
  FACT_BAND_LABELS,
  type FactDecision,
  isContactFactField,
  isFactBand,
  readBriefSections,
} from "@crm/core/records";
import { Button } from "@crm/ui/components/button";
import { carbonIcon } from "@crm/ui/components/icon";
import { EntityProse, EntitySection } from "@crm/ui/patterns/entity-sheet";
import { useLiveQuery } from "@tanstack/react-db";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type Contact, contactsCollection } from "../../lib/contacts.ts";
import {
  type ContactBrief,
  type ContactFact,
  contactBriefsCollection,
  contactFactsCollection,
  decideFact,
} from "../../lib/intel.ts";
import { calendarDate, relativeTime } from "../../lib/record-format.ts";
import { saveRecord } from "../../lib/synced-records.ts";
import { DetailList, DetailRow, StaticDetail } from "../records/detail-fields.tsx";

const AcceptIcon = carbonIcon(checkmark16);
const DismissIcon = carbonIcon(close16);
const ChevronIcon = carbonIcon(chevronDown16);

/**
 * What the agent learned about one contact (ADR 0024): its open suggestions by field (the newest
 * proposal per field) and its brief. Both are synced, so the sheet renders them with no request.
 */
export function useContactIntel(workspaceId: string, contactId: string | null) {
  const facts = useLiveQuery(() => contactFactsCollection(workspaceId));
  const briefs = useLiveQuery(() => contactBriefsCollection(workspaceId));

  const open = new Map<string, ContactFact>();

  for (const fact of facts.data ?? []) {
    if (fact.contact_id !== contactId || fact.status !== "proposed") continue;

    const held = open.get(fact.field);

    if (!held || fact.observed_at > held.observed_at) open.set(fact.field, fact);
  }

  const brief = (briefs.data ?? []).find((row) => row.contact_id === contactId) ?? null;

  return { suggestions: open, brief };
}

/** Accepting writes the value to the contact first, then marks the suggestion applied. */
export function useDecideFact(workspaceId: string) {
  return useMutation({
    mutationFn: async ({ fact, status }: { fact: ContactFact; status: FactDecision }) => {
      if (status === "applied") {
        if (!isContactFactField(fact.field)) throw new Error("This suggestion can't be applied");

        const patch: Partial<Contact> = { [fact.field]: fact.value };

        await saveRecord(contactsCollection(workspaceId), fact.contact_id, patch);
      }

      await decideFact(workspaceId, fact.id, status);
    },
    onError: (error) => toast.error(error.message),
  });
}

/** "linkedin.com" from a source URL, or null. */
function sourceName(url: string | null) {
  if (!url) return null;

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * A suggestion under a field (Paper: the Seats row): the proposed value, how sure the agent is,
 * where it came from, and Accept ✓ / Dismiss ✕.
 */
export function FactSuggestion({
  fact,
  onDecide,
  pending,
}: {
  fact: ContactFact;
  onDecide: (status: FactDecision) => void;
  pending: boolean;
}) {
  const band = isFactBand(fact.band) ? FACT_BAND_LABELS[fact.band] : fact.band;
  const source = sourceName(fact.source_url);

  const meta = [band, source, relativeTime(fact.observed_at)].filter(Boolean).join(" · ");

  return (
    <div className="flex min-w-0 items-start gap-1 px-2 pb-1">
      <div className="flex min-w-0 flex-1 flex-col leading-5">
        <span className="truncate text-foreground select-text" title={fact.value}>
          {fact.value}
        </span>
        <span className="truncate text-muted-foreground text-xs select-none">
          {fact.source_url && source ? (
            <a
              className="underline decoration-input underline-offset-2 pointer-fine:hover:decoration-foreground"
              href={fact.source_url}
              rel="noreferrer noopener"
              target="_blank"
            >
              {meta}
            </a>
          ) : (
            meta
          )}
        </span>
      </div>
      <Button
        aria-label="Accept suggestion"
        disabled={pending}
        onClick={() => onDecide("applied")}
        size="icon-xs"
        variant="ghost"
      >
        <AcceptIcon />
      </Button>
      <Button
        aria-label="Dismiss suggestion"
        disabled={pending}
        onClick={() => onDecide("dismissed")}
        size="icon-xs"
        variant="ghost"
      >
        <DismissIcon />
      </Button>
    </div>
  );
}

/** "Source · Aug 2, 2026" beside the Background label, linking the brief's source. */
function BriefSource({ brief }: { brief: ContactBrief }) {
  const date = calendarDate(brief.refreshed_at.slice(0, 10));
  const label = [sourceName(brief.source_url) ?? "Source", date].filter(Boolean).join(" · ");

  return brief.source_url ? (
    <a
      className="truncate text-muted-foreground pointer-fine:hover:underline"
      href={brief.source_url}
      rel="noreferrer noopener"
      target="_blank"
    >
      {label}
    </a>
  ) : (
    <span className="truncate text-muted-foreground">{label}</span>
  );
}

/** The agent's brief on a contact (Paper: the contact record's Background). */
export function ContactBackground({ brief }: { brief: ContactBrief }) {
  const sections = readBriefSections(brief.sections);
  const previous = sections.previousRoles ?? [];
  const [showPrevious, setShowPrevious] = useState(false);

  return (
    <EntitySection aside={<BriefSource brief={brief} />} label="Background">
      <div className="flex flex-col gap-3">
        <div className="select-text">
          <EntityProse>{brief.narrative}</EntityProse>
        </div>
        <DetailList columns={2}>
          <DetailRow label="Current role">
            <StaticDetail>{sections.currentRole ?? null}</StaticDetail>
          </DetailRow>
          <DetailRow label="Tenure">
            <StaticDetail>{sections.tenure ?? null}</StaticDetail>
          </DetailRow>
          <DetailRow label="Seniority">
            <StaticDetail>{sections.seniority ?? null}</StaticDetail>
          </DetailRow>
          <DetailRow label="Function">
            <StaticDetail>{sections.function ?? null}</StaticDetail>
          </DetailRow>
          <DetailRow label="Based">
            <StaticDetail>{sections.location ?? null}</StaticDetail>
          </DetailRow>
          {previous.length > 0 ? (
            <DetailRow label="Previously">
              <button
                aria-expanded={showPrevious}
                className="flex h-8 items-center gap-1 rounded-md px-2 text-foreground outline-none select-none pointer-fine:hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setShowPrevious((shown) => !shown)}
                type="button"
              >
                {previous.length === 1 ? "1 role" : `${previous.length} roles`}
                <ChevronIcon
                  className="size-3.5 text-muted-foreground transition-transform data-[open]:rotate-180"
                  data-open={showPrevious || undefined}
                />
              </button>
            </DetailRow>
          ) : null}
        </DetailList>
        {showPrevious ? (
          <ul className="flex flex-col gap-1 pl-28 select-text">
            {previous.map((role) => (
              <li
                className="flex min-w-0 gap-2 leading-5"
                key={`${role.title}-${role.company}-${role.years ?? ""}`}
              >
                <span className="truncate text-foreground">
                  {role.title}, {role.company}
                </span>
                {role.years ? (
                  <span className="shrink-0 text-muted-foreground tabular-nums">{role.years}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </EntitySection>
  );
}
