# ADR-0003: Bundle python-build-standalone with pre-installed wheels

- **Status:** Accepted
- **Date:** 2026-08-01
- **Issue:** BU-33

## Context

beacon-ui is useless without py-beacon. BU-33's acceptance is that a clean
machine installs the app and reaches "engine connected" with **zero manual
setup** — no `pip`, no venv, no "install Python 3.12 first".

Three ways to get a Python that can import `beacon.server`:

1. **System Python.** Find an interpreter on PATH and install into it.
2. **PyInstaller.** Freeze py-beacon and its dependencies into one executable.
3. **python-build-standalone.** Ship a relocatable CPython, with the wheels
   pre-installed into its `site-packages`.

## Decision

Ship **python-build-standalone** with py-beacon and its dependencies already
installed, as an `extraResources` payload. The engine prefers that interpreter
whenever the app is packaged.

**System Python is not a candidate for the default.** The acceptance criterion
rules it out on its own: a clean machine may have no Python, the wrong Python,
or a Python the user is not allowed to install into. It also makes the app's
behaviour depend on a global the user can change underneath it — the exact
failure mode BU-19 already had to work around locally by preferring a sibling
venv over PATH. `BEACON_PYTHON` remains as an escape hatch for developers.

**PyInstaller was the real alternative and lost on three counts.** It produces
the smallest artefact, and if size were decisive it would win.

- **NumPy, SciPy and pandas are the awkward cases**, and py-beacon needs all
  three. Their extension modules and data files need hook maintenance, and the
  failure mode is an ImportError at runtime on a user's machine rather than a
  build error on ours.
- **We would be freezing someone else's package.** py-beacon is developed
  alongside this app; a spec file in beacon-ui that has to track py-beacon's
  imports is a coupling that breaks quietly whenever py-beacon adds a
  dependency.
- **It defeats the debugging story.** With a real interpreter we can run
  `<bundled python> -m beacon.server` by hand on a user's machine and see what
  it says. A frozen binary answers far less.

python-build-standalone is what the tooling ecosystem (uv, Rye, Bazel rules)
has converged on for exactly this, its builds are reproducible and signed, and
the layout is an ordinary Python installation — so `pip install py-beacon`
into it during packaging is the whole of the work.

## Consequences

- **The installer is large.** Measured, not estimated: the unpacked payload is
  **448 MB** and the whole unpacked app **590 MB**, dominated by numpy, scipy
  and pandas. That is far more than the 60–90 MB first guessed. Accepted for
  now — it is the price of the acceptance criterion — but it is large enough
  that trimming (excluding test suites, `pip` itself, and unused scipy
  submodules) is worth a follow-up.
- **The payload is fetched at build time, not committed.** `scripts/fetch-python.mjs`
  downloads the platform's standalone build, verifies its digest, and installs
  py-beacon into it. CI caches the download.
- **One payload per platform-arch.** macOS arm64, macOS x64 and Windows x64 are
  separate artefacts; a universal macOS build would mean two Pythons in one
  bundle, which is worse than two downloads.
- **The bundled interpreter must be preferred only when packaged.** In
  development the sibling py-beacon venv is still correct — it is the checkout
  being worked on — so the resolution order is bundled → override → sibling →
  PATH, gated on `app.isPackaged`.
- **macOS notarisation will complain about the Python binaries.** They need to
  be signed with the hardened runtime along with everything else. Filed with
  BU-34 rather than solved here.

## What was verified, and what was not

**Verified on Windows x64:**

- `scripts/fetch-python.mjs` downloads the pinned standalone build, verifies
  its published SHA-256, and unpacks it. (It needed a fix: the `tar` on PATH
  from Git reads `C:\path` as `host:path`, so the script now prefers the
  bsdtar in System32.)
- `pip install` from the sibling py-beacon checkout succeeds, and the bundled
  interpreter reports `beacon.server importable`.
- `electron-builder --dir` produces an app whose `resources/python` contains
  that interpreter.
- The packaged app **spawns the bundled interpreter**, not the machine's:
  `release/win-unpacked/resources/python/python/python.exe -m
  beacon.server --port 0`, confirmed from the process table.
- The packaged app reaches **`connected`** — the engine log shows it, and
  py-beacon accepted the renderer's WebSocket.

**Not verified — and one thing is outright broken:**

- **The packaged window renders blank.** Main works, the engine connects and
  the renderer's socket attaches, but nothing paints. `did-fail-load` never
  fires and no renderer console error is emitted, so the document and its
  bundle load successfully. Tracked as its own issue; BU-33 is not done until
  it is fixed.
- The dmg has not been built at all: electron-builder cannot produce one from
  Windows. It needs a macOS runner (BU-34).
- The acceptance criterion — *clean machine* installs and reaches engine
  connected — needs a machine without a development environment. This one has
  one, so the result above is weaker evidence than it looks: it proves the
  bundled interpreter is preferred, not that nothing else on the machine was
  load-bearing.

## Revisit if

- Installer size becomes a real objection, in which case PyInstaller is worth
  re-costing against a then-frozen py-beacon dependency set.
- py-beacon starts shipping its own standalone distribution, which would make
  this beacon-ui's job to consume rather than to build.
