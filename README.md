# Delegate Wave Backpack

The creator-facing surface for delegate-wave, displayed inside Papers.

This is an independently maintained Backpack project. Its interface and
implementation are owned here, outside the Papers application binary and the
Papers source repository. Ordinary changes here must not build or release Papers.

## How it reaches delegate-wave

Backpack pages are served under `papers-backpack:` with `connect-src 'none'`, so
this page cannot make network requests of any kind. It calls Papers, which holds
the delegate-wave operator credential and performs the authenticated loopback
request on its behalf.

    page  --postMessage-->  Papers preload  --IPC-->  Papers main  --loopback-->  delegate-wave

`src/bridge/bridge.ts` restates that contract. The thirteen operations it names are
the complete surface: `overview`, `briefing`, `attention`, `job`, `propose`,
`authorize`, `integration`, `approve`, `decline`, `session.list`, `session.timeline`,
`organization.get`, `organization.change`. The page never holds a token,
a URL or an HTTP method, and its identity is attached by Papers from the page
origin rather than sent from here.

## What belongs where

### Wave organization

The expanded sidebar has an archive box next to the hamburger and a plus button
for custom groups. Use a wave's ellipsis menu to rename, archive, restore or delete
an archived wave. Rename groups with the pencil; remove a custom group with ×
(its waves return to their original Hermes groups). Drag a wave title onto a group,
or use the menu's keyboard-accessible **Move to group** selector.

Archive/delete cannot hide running or waiting work. Delete requires confirmation
and permanently removes an archived wave from this organizer, **not** from the
execution audit ledger or repository. Original tasks and Hermes ownership do not
change when names or groups change. Organization is stored durably by DW and
refreshed across windows, not kept only in browser storage.

This feature requires the creator-approved organizer relay in Papers and DW schema
38. Source changes alone do not update an already-running Papers installation.
Do not build/deploy `public/` until the companion host/server update is available.
Test results: 89/89 local tests; typecheck/build pass. Browser layout, archive and
pointer/keyboard movement were checked using `test/organizer-preview.html` under
the dev server. That fixture is sample-only and is not a production entry point.

This project owns presentation, the entry of intent, the rendering of status and
evidence, and the Integrate / Reject gestures. delegate-wave owns everything
else: operational truth, the manager state machine, workers, Git, validation,
budget accounting, authorization and integration. Deciding any of those here
would create a second, weaker copy of rules that already exist.

## Commands

    npm install
    npm run build          # typecheck + production bundle proof -> .verify-dist/
    npm run build:public   # refresh the Papers-served public/
    npm test
    npm run typecheck

Papers displays `public/index.html`, named by `project.json`. `public/` is build
output; the source of truth is `src/`.

## Verification and deployment are separate

`public/` is generated build output that is also the live runtime surface: Papers
serves that subtree directly and rereads it when the Backpack is entered, so
whatever is committed there is what the creator sees.

That makes one command unable to do both jobs. `npm run build` proves the source
typechecks and bundles, writing to an ignored `.verify-dist/`, so validation can
run on every candidate without touching the served assets -- and
`git diff --exit-code -- public` afterwards is a real check rather than a
contradiction. `npm run build:public` is the deliberate act of regenerating what
Papers serves.

A source change is not visible in Papers until `public/` is regenerated. Keep
that regeneration in its own commit: the bundle is content-hashed, so a rebuild
rewrites hundreds of asset filenames and would bury a reviewable source change.
Papers rereads the files rather than requiring a rebuild or restart, but an
already-open Backpack frame still holds the old bundle -- re-enter or reload it
to see the new surface.
