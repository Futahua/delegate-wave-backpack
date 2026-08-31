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

`src/bridge/bridge.ts` restates that contract. The eleven operations it names are
the complete surface: `overview`, `briefing`, `attention`, `job`, `propose`,
`authorize`, `integration`, `approve`, `decline`. The page never holds a token,
a URL or an HTTP method, and its identity is attached by Papers from the page
origin rather than sent from here.

## What belongs where

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
