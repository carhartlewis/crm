# 0026: The record's website research is the memory graph's core

**Status:** accepted (2026-11). Supersedes the "drawn core" part of
[0021](0021-jev-alone-decides-chat-memory.md).

## Context

ADR 0021 drew the core as a document with no facts (`MEMORY_CORE_ID`). The graph library
(`@supermemory/memory-graph`) has no core node: it lays out documents by their facts. A core
with no facts hung off one fact edge at the side, while the website research, with most of the
facts, sat in the middle. The core also showed "0 facts" and a source menu that did nothing.
comp-neo's core is the workspace's own profile source, so it holds facts and sits at the centre.

## Decision

- **The website research is the core.** When the workspace (or company) has a
  `website-research` source with facts, `GET /api/memory/graph` draws it as the core: the
  record's name and kind, its own facts around it, and every other source's first current fact
  linked to it (`derives`). A source with no facts yet hangs off the core's first fact
  (`extends`). The core opens as that source; its sheet shows the source's own title and kind.
- **Until research lands**, or for a record with no website, the drawn core of 0021 stays.

## Consequences

- The record is the centre of its graph, as in comp-neo, and its node opens to real content.
- The core's node changes id (`memory-core` to `website-research`) when research arrives.
