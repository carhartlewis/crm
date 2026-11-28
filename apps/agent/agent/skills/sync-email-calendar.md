---
description: Use when asked to sync, log or catch up on email and calendar history with a CRM contact, company or deal, or when a chat asks to "Sync email & calendar" for a record.
---

# Sync email and calendar into the CRM

Log the member's real email threads and calendar events with CRM contacts as activity, so the
record's Activity tab and "We know them" show them. Work only from the member's connected apps on
the `connections` connection: a mail app (such as Superhuman, Gmail or a custom mail connector) and
a calendar or meeting app (such as Google Calendar or Granola). If neither is connected, say in one
line that they can connect one on the Connections page, and stop.

Load the `crm-tools` skill first if you haven't in this chat: it has each tool's exact
parameter names.

## Steps

1. Find the people. For a company, list its contacts (`connections__crm__list_contacts` with its
   `companyId`); for a deal, read it and list its company's contacts; for a contact, read them.
   Keep each contact's id and email. A contact without an email can't be matched: skip them.
2. Search mail for each email address (from or to), newest first, about the last 90 days unless
   the person asked for another range. Read each thread you log.
3. Search the calendar for events with each address as an attendee: the last 90 days and the next
   30 days, so the next meeting shows too.
4. Log each thread once with `connections__crm__log_email` and each event once with
   `connections__crm__log_meeting`: the app's own thread or event id, the subject, the time of
   the latest message (or the event start), the message count or duration and attendee count, a
   link that opens it, and the contact id (plus the deal id when the thread is clearly about that
   deal). Logging the same id again updates it, so re-running is safe.
5. Reply with one line per kind: how many threads and meetings you logged, and the next meeting
   if there is one. No table of the threads.

## Rules

- `summary` keeps the thread's or event's own words: quote or closely paraphrase what was asked,
  offered or agreed, in a sentence or two. Never invent or embellish, and never add what you
  think it means.
- Skip newsletters, automated notifications, calendar holds without other attendees, and anything
  that isn't a conversation with the contact.
- Never put mailbox or calendar text into a web search query, and never copy it into the sandbox
  or a file. Read it through the apps' tools and write only the summary to the CRM.
- These are writes: the chat's permission mode decides whether the member approves them first.
