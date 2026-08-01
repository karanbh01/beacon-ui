# ADR-0004: Auto-update from GitHub Releases, downloaded on request

- **Status:** Accepted
- **Date:** 2026-08-01
- **Issue:** BU-34

## Context

BU-33 ships an installer. Without an update path, every fix means telling the
user to go and fetch a new one — and since Beacon carries its own Python
(ADR-0003), a py-beacon fix needs a full app update too. That makes updating
routine rather than rare, which is exactly the case for automating it.

## Decision

**electron-updater against GitHub Releases**, with `autoDownload` off.

### Why GitHub Releases

The repo is already there, `GITHUB_TOKEN` already exists in Actions, and
electron-builder publishes to it with no extra infrastructure. An S3 or
generic feed would mean a bucket, credentials and a bill for hosting ~160 MB
per platform per release, to solve a problem one contributor does not have.
The provider is one line in `electron-builder.yml`, so this is cheap to
revisit if the repo ever goes private in a way that breaks the feed.

Releases are created as **drafts**. The tag builds the artefacts; a human
decides they are worth shipping. A tag pushed by mistake then costs nothing.

### Why `autoDownload` is off

This is the decision that differs from the electron-updater default, and it
follows from ADR-0003: every update is a whole new installer with its own
CPython inside. Measured on Windows x64, that is **159 MB** compressed —
smaller than the 590 MB it unpacks to, but still a download nobody should
start on someone's behalf on a metered or slow connection, and one that would
be invisible while it happened.

That the update is always the full app is the part worth internalising. There
is no "just update py-beacon" path: the interpreter is inside the bundle, so a
one-line fix in py-beacon costs the user the same 159 MB as a rewrite.

So the footer states that an update exists and the user starts the download.
The states are distinct for that reason: `available` is an offer,
`downloading` shows progress, `ready` invites a restart. Each is a separate
thing the user might want to act on, or not.

### Why a failed background check says nothing

Being offline is the ordinary reason a timed check fails, and there is nothing
the user can do about it. A status bar that permanently reads "update check
failed" trains people to ignore the status bar. A check the user *asked* for
by clicking the version does report its failure, because then somebody is
waiting for an answer.

## Consequences

- **macOS auto-update needs a `zip` target, not just the dmg.** Squirrel.Mac
  applies updates from the zip; a dmg-only release installs fine and can then
  never update itself. Both are built and uploaded, so a macOS release is
  roughly twice the bytes of a Windows one.
- **macOS auto-update does not work until the app is signed.** Squirrel.Mac
  refuses an update whose signature does not match the installed app, and
  nothing is signed yet. The mechanism is in place and inert there; Windows
  updates unsigned without complaint. Tracked in #49, which must land before
  the app is shared outside this machine.
- **One arch per build run.** `extraResources` ships whatever
  `scripts/fetch-python.mjs` last unpacked and that payload is
  arch-specific, so the release workflow matches runner to arch
  (`macos-14`/arm64, `macos-13`/x64) and passes the arch explicitly.
- **package.json is the version, not the tag.** electron-builder ignores the
  tag, so the workflow fails the build when they disagree rather than
  publishing a release whose contents contradict its name.
- **The bundled py-beacon defaults to `main`.** A release built today and one
  built next week from the same tag can therefore differ. `PY_BEACON_REF` is
  a workflow input so a release can pin it; making that pin mandatory is
  worth doing once py-beacon starts tagging.
- **Updates are all-or-nothing on macOS, differential on Windows.** NSIS
  emits a `.blockmap` beside the installer (verified — 165 KB next to the
  159 MB exe), so a Windows user re-downloads only the blocks that changed,
  and a py-beacon-only fix should cost far less than a full 159 MB. The mac
  zip has no equivalent.

## What was verified, and what was not

**Verified on Windows x64, against the real packaged app and the real GitHub
feed:**

- `electron-builder --win --x64` produces `Beacon Setup 0.0.1.exe` (159 MB),
  `latest.yml` carrying its sha512 and size, and a 165 KB `.blockmap`.
- `app-update.yml` is baked into `resources/`, naming the github provider and
  `releaseType: draft`.
- The timed check fires and reaches GitHub. With no releases published yet it
  answers `No published versions on GitHub` — the app logged
  `[update] checking` → that message → `[update] idle`, so a background
  failure really does return to silence rather than sticking.
- Clicking the version in the footer reports the same failure, as
  `update check failed` in muted italic with the reason in its tooltip. That
  asymmetry — the identical error silent when timed, spoken when asked for —
  is the behaviour this ADR argues for, and it is the one observed.

**Not verified:**

- **No update has ever actually been applied.** Nothing exercises
  `available → downloading → ready → quitAndInstall` end to end, because that
  needs a published release newer than the installed build. The unit tests
  cover the state machine; they cannot cover Squirrel.
- The release workflow has never run. It is written against the same commands
  used by hand here, but the macOS legs in particular are unexercised — and
  they are the ones that cannot be tried from this machine at all.
- macOS entirely: no dmg, no zip, no notarisation (#49).

## Revisit if

- The payload shrinks enough that background downloading stops being rude, in
  which case `autoDownload` becomes the better default.
- Releases need to reach people who should not see the repo, which GitHub
  Releases cannot do for a private repo without handing out a token.
