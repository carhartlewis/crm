# Domain docs

This repo uses a single shared domain context: `GLOSSARY.md` and `docs/adr/` at the repository root.

Before exploring, read `GLOSSARY.md` and any ADRs relevant to the work. If a file or directory does not exist, proceed silently. Create domain documentation only when terminology or decisions have actually been resolved.

Use the glossary’s vocabulary in code, tests, issues, and proposals. If a needed concept is absent, check whether an existing term fits before proposing a new one.

Surface conflicts with existing ADRs explicitly, explaining why the decision should be revisited. Do not silently override them.
