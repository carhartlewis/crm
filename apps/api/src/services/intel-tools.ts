import { CONTACT_FACT_FIELDS, FACT_BANDS } from "@crm/core/records";
import type { LocalTool } from "@crm/integrations/gateway";
import type { FactOutcome } from "@crm/core/records";
import { Effect, Schema } from "effect";
import { run, tool } from "./crm-tools.ts";
import type { IntelService } from "./Intel.ts";
import type { AgentCaller } from "./Memory.ts";

/**
 * The agent's research and sync tools (ADR 0024): it judges, the CRM stores. Research marks a
 * record's enrichment state, records contact facts (filled at once, ADR 0025), and writes a
 * contact brief; mail and calendar sync logs one activity per thread or event.
 */

const Text = (description: string) =>
  Schema.optional(Schema.NullOr(Schema.String)).annotate({ description });

const Count = (description: string) =>
  Schema.optional(Schema.NullOr(Schema.Number)).annotate({ description });

const Links = {
  contact_id: Text("The contact it involves, from crm__list_contacts (ctc_…)."),
  company_id: Text(
    "The company, from crm__list_companies (com_…). Filled from the contact or deal when left out.",
  ),
  deal_id: Text("The deal it is about, from crm__list_deals (del_…), when there is one."),
};

/** What the agent is told about each outcome, so it can say what it filled. */
const OUTCOME_NOTES: Record<FactOutcome, string> = {
  applied: "Saved on the contact.",
  proposed: "A member typed a different value; it waits on the contact's sheet for them.",
  kept: "A member's own value stays; nothing was changed.",
  too_unsure:
    "Not saved: too unsure (below 0.6, or an email or phone number that could not be checked).",
};

const FIELD_HELP = CONTACT_FACT_FIELDS.map((field) => field.column).join(", ");

/** The record ids a log call names, as the service takes them. */
const links = (input: {
  contact_id?: string | null | undefined;
  company_id?: string | null | undefined;
  deal_id?: string | null | undefined;
}) => ({ contactId: input.contact_id, companyId: input.company_id, dealId: input.deal_id });

export function intelTools(intel: IntelService, caller: AgentCaller): readonly LocalTool[] {
  const actor = { userId: caller.userId, activeWorkspaceId: caller.workspaceId };

  return [
    tool(
      {
        name: "set_enrichment_status",
        description:
          "Mark research on a company or contact: `running` when you start, then `complete` when you have filled in what you found, `skipped` when nothing could be found, or `failed` with a short `error`. The record's sheet shows this state.",
        readOnly: false,
        input: Schema.Struct({
          kind: Schema.Literals(["company", "contact"]),
          id: Schema.String.annotate({ description: "The company (com_…) or contact (ctc_…) id." }),
          status: Schema.Literals(["running", "complete", "skipped", "failed"]),
          error: Text("Why it failed, in one short sentence."),
        }),
      },
      (input) => run(intel.setEnrichment(actor, input)),
    ),
    tool(
      {
        name: "record_contact_fact",
        description: `Record a value you found for one of a contact's fields (${FIELD_HELP}), with how sure you are. It fills the contact at once when you are sure (score 0.6 or more), the field is empty, or it replaces a value you wrote before. A value a member typed stays unless the evidence shows a real change; only then may a member be asked. Only record what a source says: give the page as \`source_url\` and quote it in \`evidence\`. For \`email\` and \`phone\`, pass what crm__find_email or crm__find_phone returned: the CRM checks the mailbox or line and that check, not your score, decides (a verified address or live line fills the contact; a bouncing address or dead line is refused). For \`image_url\`, pass the \`photoUrl\` crm__find_photo or crm__linkedin_profile returned; it is copied into the CRM.`,
        readOnly: false,
        input: Schema.Struct({
          contact_id: Schema.String.annotate({ description: "A contact id (ctc_…)." }),
          field: Schema.String.annotate({ description: `One of: ${FIELD_HELP}.` }),
          value: Schema.String.annotate({
            description: "The value; full URLs for profile links.",
          }),
          score: Schema.Number.annotate({
            description:
              "How sure you are, from 0 to 1: 0.9+ for their own profile or a match score of 90+, 0.6–0.9 for a good indirect source. Below 0.6 nothing is saved.",
          }),
          band: Schema.optional(Schema.Literals(FACT_BANDS)).annotate({
            description:
              "verified (a primary source such as their own profile), probable or possible. From the score when left out.",
          }),
          evidence: Schema.optional(Schema.Array(Schema.String)).annotate({
            description: "Short quotes from the sources that support it.",
          }),
          source_url: Text("The page it came from."),
          phone_type: Schema.optional(Schema.Literals(["mobile", "work", "other"])).annotate({
            description: "For a phone: the line type crm__find_phone gave.",
          }),
        }),
      },
      (input) =>
        run(
          intel
            .recordFact(actor, {
              contactId: input.contact_id,
              field: input.field,
              value: input.value,
              score: input.score,
              band: input.band,
              evidence: input.evidence,
              sourceUrl: input.source_url,
              phoneType: input.phone_type,
            })
            .pipe(Effect.map(({ id, outcome }) => ({ id, outcome, note: OUTCOME_NOTES[outcome] }))),
        ),
    ),
    tool(
      {
        name: "write_contact_brief",
        description:
          "Write or replace the short brief on a contact, shown as Background on their sheet: a two- or three-sentence narrative of who they are and what they own, plus their current role, tenure, previous roles, seniority, function and location. Only what sources say; leave out what you don't know.",
        readOnly: false,
        input: Schema.Struct({
          contact_id: Schema.String.annotate({ description: "A contact id (ctc_…)." }),
          narrative: Schema.String,
          current_role: Text("Such as VP of Engineering, Platform."),
          tenure: Text("Such as 4 years at Northwind Labs."),
          previous_roles: Schema.optional(
            Schema.Array(
              Schema.Struct({
                title: Schema.String,
                company: Schema.String,
                years: Text("Such as 2019–2022."),
              }),
            ),
          ),
          seniority: Text("Such as Executive, Director, Manager or Individual contributor."),
          function: Text("Such as Engineering, Finance or Sales."),
          location: Text("Such as San Francisco, US."),
          source_url: Text("The main page the brief came from."),
        }),
      },
      (input) =>
        run(
          intel.writeBrief(actor, {
            contactId: input.contact_id,
            narrative: input.narrative,
            sections: {
              currentRole: input.current_role,
              tenure: input.tenure,
              previousRoles: input.previous_roles,
              seniority: input.seniority,
              function: input.function,
              location: input.location,
            },
            sourceUrl: input.source_url,
          }),
        ),
    ),
    tool(
      {
        name: "log_email",
        description:
          "Log an email thread from the member's connected mail on a contact, company or deal. One activity per thread: logging the same `thread_id` again updates it. `summary` keeps the member's and the other side's own words (a quote or a close paraphrase of what was asked or agreed); never invent or embellish.",
        readOnly: false,
        input: Schema.Struct({
          thread_id: Schema.String.annotate({ description: "The mail app's thread id." }),
          subject: Schema.String,
          summary: Text("What the thread says, in its own words."),
          occurred_at: Schema.String.annotate({ description: "ISO time of the latest message." }),
          messages: Count("How many messages the thread has."),
          last_reply_at: Text("ISO time of the contact's latest reply, if they replied."),
          ...Links,
          external_url: Text("A link that opens the thread in the mail app."),
        }),
      },
      (input) =>
        run(
          intel.logEmail(actor, {
            threadId: input.thread_id,
            subject: input.subject,
            summary: input.summary,
            occurredAt: input.occurred_at,
            messages: input.messages,
            lastReplyAt: input.last_reply_at,
            externalUrl: input.external_url,
            ...links(input),
          }),
        ),
    ),
    tool(
      {
        name: "log_meeting",
        description:
          "Log a calendar event from the member's connected calendar on a contact, company or deal; future events show as the next meeting. One activity per event: logging the same `event_id` again updates it. `summary` keeps the event's own words (its description or the notes); never invent what was said.",
        readOnly: false,
        input: Schema.Struct({
          event_id: Schema.String.annotate({ description: "The calendar's event id." }),
          subject: Schema.String.annotate({ description: "The event title." }),
          summary: Text("The event's description or notes, in their own words."),
          occurred_at: Schema.String.annotate({ description: "ISO start time." }),
          duration_minutes: Count("How long it is."),
          attendees: Count("How many people are invited."),
          ...Links,
          external_url: Text("A link that opens the event in the calendar."),
        }),
      },
      (input) =>
        run(
          intel.logMeeting(actor, {
            eventId: input.event_id,
            subject: input.subject,
            summary: input.summary,
            occurredAt: input.occurred_at,
            durationMinutes: input.duration_minutes,
            attendees: input.attendees,
            externalUrl: input.external_url,
            ...links(input),
          }),
        ),
    ),
  ];
}
