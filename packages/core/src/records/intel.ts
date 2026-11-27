import { Option, Schema } from "effect";
import type { Json } from "../chat/index.ts";
import { ID_PREFIXES, isRecordId } from "../ids/index.ts";

/**
 * What the agent learns about records (ADR 0024): proposed contact facts, contact briefs, the
 * email and meeting activity it logs, and the record a chat is about. The API stores what the
 * agent writes through `crm__` tools; the web shows it. Rules shared by both live here.
 */

/** The record kinds a chat can be about (a record sheet's Agent tab). */
export const CHAT_RECORD_KINDS = ["company", "contact", "deal"] as const;

export type ChatRecordKind = (typeof CHAT_RECORD_KINDS)[number];

const CHAT_RECORD_KIND_SET = new Set<string>(CHAT_RECORD_KINDS);

export function isChatRecordKind(value: string): value is ChatRecordKind {
  return CHAT_RECORD_KIND_SET.has(value);
}

/** Whether `id` is a valid id for a record of `kind`. */
export function isRecordOfKind(kind: ChatRecordKind, id: string) {
  return isRecordId(ID_PREFIXES[kind], id);
}

export const isContactFactId = (value: string) => isRecordId(ID_PREFIXES.contact_fact, value);

/** The contact columns the agent may propose a value for, and how the sheet labels them. */
export const CONTACT_FACT_FIELDS = [
  { column: "title", label: "Title" },
  { column: "seniority", label: "Seniority" },
  { column: "function", label: "Function" },
  { column: "linkedin_url", label: "LinkedIn" },
  { column: "twitter_url", label: "X" },
  { column: "github_url", label: "GitHub" },
] as const;

export type ContactFactField = (typeof CONTACT_FACT_FIELDS)[number]["column"];

const FACT_FIELD_SET = new Set<string>(CONTACT_FACT_FIELDS.map((field) => field.column));

export function isContactFactField(value: string): value is ContactFactField {
  return FACT_FIELD_SET.has(value);
}

/** How sure the agent is: `verified` from a primary source, then `probable`, then `possible`. */
export const FACT_BANDS = ["verified", "probable", "possible"] as const;

export type FactBand = (typeof FACT_BANDS)[number];

const FACT_BAND_SET = new Set<string>(FACT_BANDS);

export function isFactBand(value: string): value is FactBand {
  return FACT_BAND_SET.has(value);
}

/** The band a score falls in, when the agent gives none. */
export function bandFor(score: number): FactBand {
  if (score >= 0.85) return "verified";

  return score >= 0.6 ? "probable" : "possible";
}

export const FACT_BAND_LABELS: Record<FactBand, string> = {
  verified: "Verified",
  probable: "Probable",
  possible: "Possible",
};

/**
 * A fact's life: the agent proposes it; a member applies (the contact column takes the value) or
 * dismisses it; a newer proposal for the same field supersedes it.
 */
export const FACT_STATUSES = ["proposed", "applied", "dismissed", "superseded"] as const;

export type FactStatus = (typeof FACT_STATUSES)[number];

/** The decisions a member makes on a proposed fact. */
export const FACT_DECISIONS = ["applied", "dismissed"] as const;

export type FactDecision = (typeof FACT_DECISIONS)[number];

const FACT_DECISION_SET = new Set<string>(FACT_DECISIONS);

export function isFactDecision(value: string): value is FactDecision {
  return FACT_DECISION_SET.has(value);
}

/** A job the contact held before the current one. */
export const PreviousRole = Schema.Struct({
  title: Schema.String,
  company: Schema.String,
  years: Schema.optional(Schema.NullOr(Schema.String)),
});

export type PreviousRole = typeof PreviousRole.Type;

/** The structured part of a contact brief (`contact_brief.sections`). */
export const BriefSections = Schema.Struct({
  currentRole: Schema.optional(Schema.NullOr(Schema.String)),
  tenure: Schema.optional(Schema.NullOr(Schema.String)),
  previousRoles: Schema.optional(Schema.Array(PreviousRole)),
  seniority: Schema.optional(Schema.NullOr(Schema.String)),
  function: Schema.optional(Schema.NullOr(Schema.String)),
  location: Schema.optional(Schema.NullOr(Schema.String)),
});

export type BriefSections = typeof BriefSections.Type;

const decodeSections = Schema.decodeUnknownOption(BriefSections);

/** A synced `sections` value, or empty sections when it doesn't match. */
export function readBriefSections(value: Json): BriefSections {
  return Option.getOrElse(decodeSections(value), () => ({}));
}

/** `meta` of an email activity the agent logged from a thread. */
export const EmailMeta = Schema.Struct({
  messages: Schema.optional(Schema.Number),
  lastReplyAt: Schema.optional(Schema.NullOr(Schema.String)),
});

/** `meta` of a meeting activity the agent logged from a calendar event. */
export const MeetingMeta = Schema.Struct({
  durationMinutes: Schema.optional(Schema.Number),
  attendees: Schema.optional(Schema.Number),
});

const decodeEmailMeta = Schema.decodeUnknownOption(EmailMeta);
const decodeMeetingMeta = Schema.decodeUnknownOption(MeetingMeta);

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** The parts of an activity's `meta` that email and meeting logs set (others are ignored). */
export interface ActivityMeta {
  readonly messages?: number;
  readonly lastReplyAt?: string | null;
  readonly durationMinutes?: number;
  readonly attendees?: number;
}

/** "12 messages" for an email thread, "45 min · 4 attendees" for a meeting; null otherwise. */
export function activityMetaLine(type: string, meta: ActivityMeta | null): string | null {
  if (type === "email") {
    const email = Option.getOrNull(decodeEmailMeta(meta));

    return email?.messages ? plural(email.messages, "message") : null;
  }

  if (type === "meeting") {
    const meeting = Option.getOrNull(decodeMeetingMeta(meta));

    const parts = [
      meeting?.durationMinutes ? `${meeting.durationMinutes} min` : null,
      meeting?.attendees ? plural(meeting.attendees, "attendee") : null,
    ].filter((part) => part !== null);

    return parts.length > 0 ? parts.join(" · ") : null;
  }

  return null;
}

/** The fields of an activity row the relationship summary reads. */
export interface RelationshipActivity {
  readonly type: string;
  readonly contact_id: string | null;
  readonly subject: string | null;
  readonly occurred_at: string;
  readonly meta: ActivityMeta | null;
}

export interface Relationship {
  /** Email messages logged with them (a thread counts its messages, else one). */
  readonly emails: number;
  /** The latest reply in a logged thread, or the latest email when none says. */
  readonly lastEmailAt: string | null;
  /** Meetings held so far. */
  readonly meetings: number;
  readonly nextMeeting: { readonly at: string; readonly subject: string | null } | null;
}

/** "We know them": emails and meetings logged with one contact, as of `now` (ISO). */
export function relationship(
  activities: readonly RelationshipActivity[],
  contactId: string,
  now = new Date().toISOString(),
): Relationship {
  let emails = 0;
  let lastEmailAt: string | null = null;
  let meetings = 0;
  let nextMeeting: Relationship["nextMeeting"] = null;

  for (const activity of activities) {
    if (activity.contact_id !== contactId) continue;

    if (activity.type === "email") {
      const meta = Option.getOrNull(decodeEmailMeta(activity.meta));
      const last = meta?.lastReplyAt ?? activity.occurred_at;

      emails += meta?.messages ?? 1;

      if (lastEmailAt === null || last > lastEmailAt) lastEmailAt = last;
    }

    if (activity.type === "meeting") {
      if (activity.occurred_at <= now) meetings += 1;
      else if (nextMeeting === null || activity.occurred_at < nextMeeting.at) {
        nextMeeting = { at: activity.occurred_at, subject: activity.subject };
      }
    }
  }

  return { emails, lastEmailAt, meetings, nextMeeting };
}
