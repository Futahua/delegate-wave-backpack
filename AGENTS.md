# Retirement checkpoint — 2026-10-07

The creator retired this Backpack. Its ChatGPT local coder view now belongs to
Pencilcase (`../Pencilcase/coder/`) and opens from a dedicated tool entry there.
This project and Backpack data remain archived for recovery; do not deploy it as
a competing active view. The companion service and its session data remain in use.
The historical governing document below describes the preserved project.

# Delegate Wave — governing document

Read this first and completely before working in this repository.

## Product north star

Papers is the creator's **personal programmable environment on an actual machine,
layered over Windows**. Its scope includes the machine's real files, installed
applications, native windows, devices, running processes, services and working state.
Actions must work with those real things and produce the intended result on the machine.

It keeps the best tools, applications, native machinery, agents, custom surfaces,
scripts and behaviors under the creator's fingers with minimal cognitive overhead.
Windows is the compatibility substrate for the software and machine the creator uses.
Electron, C#, Win32, Chromium, external programs, local services, agents and remote
systems are implementation choices; none defines or limits the product.

The creator describes the desired experience. Agents own architecture, implementation,
migration, testing and evidence. Internal implementation state must not become work
for the creator to manage.

The goal is maximum useful capability and excellent UX without growth making the
system progressively more brittle or expensive for agents to change.
**Capability is unbounded. Coupling is bounded.** Architecture preserves freedom.
Use the existing owner when it owns the truth; widen its contract when needed; create
another owner when the truth or lifecycle differs. Do not make unrelated systems own
new truth or sacrifice accepted behavior for architectural uniformity.

This vision is recorded in the opening of [the original north-star handoff](https://github.com/Futahua/Papers-3/blob/251aa0bf9e9ba3fe336b3354c3cd4b7f972af5c6/REFACTOR-HANDOFF.md).
Its dated paths, implementation plans and old runtime instructions are historical.

## Authority and working rules

This is this repository's single governing document. Current creator instructions
outrank it. Other documents supply technical reference, evidence, history or proposals;
they do not independently govern product direction or authorize work. Record accepted
corrections here rather than making several competing contracts.

- Preserve accepted behavior, creator data and unrelated changes. If recently working
  behavior regresses, compare history before inventing replacement architecture.
- Reuse existing trackers, services, applications and native behavior. Equivalent actions
  should converge on the same owner before identity, mutation and persistence.
- Keep failure local. A preview failure must not disable unrelated work or durable state.
- Inspect the actual source and running build; distinguish source tests from installed
  behavior. Use isolated fixtures and avoid taking the creator's mouse or keyboard.
- Honor authorization already given in the conversation. A document does not revoke it
  or require repeated permission. Publishing, installing, restarting or destructive work
  needs applicable authorization; ordinary inspection and reversible fixes can proceed.
- **Current cleanup scope (2026-10-07): documentation and comments first.** Reconcile
  stale or conflicting descriptions and clarify ownership. This cleanup does not authorize
  code rewrites, refactoring, behavior changes, deployment or publication. Historical
  refactor roadmaps are not the current assignment.

## What this Backpack is for

Delegate Wave is the creator-facing cockpit for delegated work: status, evidence,
attention and deliberate authorization/integration gestures. It presents operational
truth owned by the companion delegate-wave service; it must not invent a second manager,
worker, budget, Git or authorization state machine in the UI.

This independent Backpack owns presentation and entry of intent. Papers owns the scoped
relay; the companion service owns operations and durable workstream facts. Keep tokens
out of pages and derive Backpack identity from the trusted host origin.

The relay is a versioned current contract, not an eternal fixed operation count. Inspect
src/bridge/bridge.ts and the companion host/service before adding behavior. Reuse or
widen the right owner's contract for a demonstrated missing truth. Changes to host,
service and presentation must remain explicit and compatible; do not silently broaden
credentials or move operational policy into Papers.

Read Papers' AGENTS.md for host changes. Ordinary Backpack work does not publish Papers.
Use [README.md](README.md) for build/verification and deployment details and
[docs/UX_SOURCES.md](docs/UX_SOURCES.md) for design references. public/ is served generated
output; src/ is source. Verify with npm test, npm run typecheck and npm run build as
appropriate. npm run build:public changes the served runtime, so use existing applicable
authorization and compatible companion versions. Docs cleanup does not deploy it.
