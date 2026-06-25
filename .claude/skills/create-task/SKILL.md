---
name: create-task
description: Turn a requirement source (an email, a file, or pasted text) into a house-style user story saved under tasks/. Use to capture work to be done — no Jira board needed.
argument-hint: [source: email subject/label | file-path | pasted text]
---

# Create a task

Turn a raw requirement **source** into a single, well-formed **user story** written to the `tasks/` folder. There is no Jira board — the story file *is* the deliverable. Be reproducible: same source → same story.

## 1. Ingest the source

The requirement may arrive as:

- an **email** → find it with `mcp__claude_ai_Gmail__search_threads` (search by the subject, sender, or label given to you; resolve a label name with `mcp__claude_ai_Gmail__list_labels`), then read it with `mcp__claude_ai_Gmail__get_thread`. If several threads match, list them and let the user pick — don't guess.
- a **local file** → read it with the Read tool.
- **pasted text** in the conversation.

Keep the source's language in the story you write.

## 2. Ground the scope in the codebase

When the requirement is vague about *where* it lands, confirm with Read/Grep/Glob which part of the app it touches (e.g. the `TimeRecord` data layer in `application/shared/data`, an action in `application/web-app/src/actions`, a page or component) so the scope and acceptance criteria are concrete and verifiable.

## 3. Write the story — house template

Write to `tasks/<slug>.md`, where `<slug>` is a kebab-case summary of the title (e.g. `edit-timeclock-stamps.md`). Create the `tasks/` folder if it does not exist.

```markdown
# <Title — concise, imperative or noun phrase>

**User story:** As a <role>, I want <capability> so that <benefit>.

## Context
<why this exists / where it sits in the app>

## Scope
<what is being built or changed>

## Acceptance criteria
- <independently verifiable criterion>
- <independently verifiable criterion>

## Out of scope
- <anything explicitly excluded>
```

House-style rules:

- **Title** — concise, imperative or a clear noun phrase; match the source's language.
- **Acceptance criteria** — a plain bullet list (no `[ ]` checkboxes); each item independently verifiable on its own.
- **No estimates** — never assign story points. Time estimates, only if asked, are in hours/days.
- **No source/effort lines** — don't add "Quelle"/source-reference or effort lines to the body.
- **One story per file.** If the source clearly describes several independent features, write one file each.

## 4. Dedupe, then report

- Before writing, Glob `tasks/*.md` to check for an existing story with the same slug. If one exists, read it and confirm with the user before overwriting — don't clobber another participant's work.
- After writing, report the path(s) you created. Hand off to the **`engineer`** agent for implementation — this skill writes the task, it does not implement it.

