# Live Work UX source ledger

## Backpack coordination-board reference sheet

| Backpack surface | Reference authority | Applied rule |
| --- | --- | --- |
| Whole canvas | Creator's original coordination-board sketch | Time runs downward; overlap branches horizontally; settled and live remain one durable object. |
| Time rail and interval blocks | Linear Timeline | Quiet ruler, proportional gaps and restrained labels. No planning fields or draggable scheduling. |
| Session rail | Cursor 3 Agents Window | Human task hierarchy first. Technical Hermes/session IDs live in inspect text only. |
| Masthead | Codex app | Compact thread chrome; request collapsed by default; status and elapsed time stay quiet. |
| Live stream | OpenCode `message-part.tsx` / `basic-tool.tsx` at `10765ff2` | Prose is prose; semantic tool rows; running state is limited to changing content; exact detail is disclosed. |
| Settled disclosure and scroll | T3 Code timeline sources at `2daff8c` | Calm compaction, stable inline expansion, strict history-reading/follow modes. Native DOM remains the scroll owner. |
| Streaming ancestor | Papers coordination dashboard | Stable part IDs, in-place real updates and independent streams. Whole-card pulses, green washes and fake fixed-rate typing are rejected. |

Motion invariant: **aliveness comes from truthful content changing, not decorative motion**. Animation may interpolate a real state transition; it may not invent one.

This Backpack is an independent Papers project. Its Watch experience borrows proven
interaction behavior while Delegate Wave remains the authority for every displayed fact.

| Component | Sources inspected | Revision | Retained | Rejected | Copied code / license |
| --- | --- | --- | --- | --- | --- |
| Timeline follow | T3 `timelineScrollAnchoring.ts`, `MessagesTimeline.logic.ts` | `2daff8c25adf701fddd062ae93b94cc57d420ec2` | Explicit following/free modes; strict 40px rearm band; reading position survives disclosure | Half-viewport “near end”; minimap; T3 runtime contracts | Small algorithmic adaptation in `src/live-work/live-edge.ts`; MIT notice below |
| Settled work | T3 `MessagesTimeline.logic.ts` and Codex completed-task behavior | T3 revision above | Ordinary reads/searches collapse after settlement; failures/evidence/outcomes stay visible | Permanent full transcript; ornamental completion animation | Behavior adapted; no component copied |
| Changed files | T3 `changedFilesPresentation.ts` | T3 revision above | Bounded paths plus additions/deletions, result-level placement | Diff tree and T3 file contracts | Behavior adapted; no source copied |
| Tool/action row | OpenCode `message-part.tsx`, `message-part.css`, timeline playground | `10765ff2a9da8c3b88e4de873aa383a49c318912` | Natural read/search/edit/write/command/subagent/web/question/todo vocabulary; one stable operation evolving through lifecycle | SolidJS components, SDK types, design system | Semantic reference only; no source copied |
| Attention moment | Cline chat-row and UI protocol | `48d63852745460ff0fa3dfcc0457bbe2493841de` | Question/failure enters the stream as an unmistakable intervention without becoming a modal admin workflow | VS Code webview architecture and monolithic row component | Interaction reference only; no source copied |
| Actor panel | T3 `AgentsPanel.tsx`; Claude multi-agent presentation | T3 revision above | Compact parent/child topology; settled parallel workers collapse to a summary | Four fixed columns, graph canvas, runtime concepts borrowed from another product | Behavior implemented against fixture contract |
| Result hierarchy | Cursor and Codex visual behavior | Visual study only | Task → current phase → work → authoritative result; calm completed state | Branding, gradients, “mission control” dashboard language | No source copied |

## Files inspected directly

- `D:/CodexTemp/papers-t3-audit-20260814/t3code/apps/web/src/components/chat/timelineScrollAnchoring.ts`
- `D:/CodexTemp/papers-t3-audit-20260814/t3code/apps/web/src/components/chat/MessagesTimeline.logic.ts`
- `D:/CodexTemp/papers-t3-audit-20260814/t3code/apps/web/src/components/chat/changedFilesPresentation.ts`
- `D:/CodexTemp/papers-t3-audit-20260814/t3code/apps/web/src/components/AgentsPanel.tsx`

The pinned OpenCode and Cline revisions were used as semantic/interaction references from
the reviewed source inventory in the implementation directive. No OpenCode or Cline code
is present in this branch. Before any later substantial copy, inspect the exact pinned file
locally and add its copied-file boundary to `THIRD_PARTY_NOTICES.md` first.

## Truth boundary

Activity means an observable operation occurred. Evidence is rendered in a distinct
landmark and names its durable source record. The fixture UI does not promote worker prose
or a tool's stdout into validation evidence.
