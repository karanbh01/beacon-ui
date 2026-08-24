# Data py-beacon does not serve yet

**For:** py-beacon
**From:** beacon-ui, BU-100 / BU-101 / BU-102 / BU-106
**Status:** open

Four asks, all found while building against a running engine at
`c8f53f1` (BN-142). Each says what was checked, so none of it has to be
taken on trust.

## 1. FX in the coverage report (BU-100)

`GET /data/coverage` returns `market`, `reference`, `corporate_actions` and
`features`. There is no `fx` row, though the generator writes one —
`Generated 6 FX pair(s): EURUSD, HKDUSD, JPYUSD, GBPUSD, CADUSD, AUDUSD`.

**Ask:** an `fx` entry on the same `DatasetCoverage` shape as the others.
`identifiers` is naturally the pair count.

The Coverage view renders whatever rows come back, so nothing changes here
once the engine sends it.

## 2. FX rates as a series (BU-101)

There is no way to read an FX rate. Nothing under `/data/` mentions fx, and
the six pairs are not addressable through `GET /data/prices/{identifier}`.

Market bars do carry a `RATE` column — `OPEN, HIGH, LOW, CLOSE, VOLUME,
SHARES_OUTSTANDING, FREE_FLOAT, RATE` — which is null for a USD name. That is
the instrument's rate, not a pair series, so it answers "what was this
converted at" and not "what did EURUSD do".

**Ask, in preference order:**

1. Make pairs addressable through the existing prices endpoint, so `EURUSD` is
   just another identifier. The view, the chart and the typeahead already work
   for anything `/data/prices` answers, so this costs the client nothing.
2. Failing that, `GET /data/fx/{pair}` returning the same frame shape.

Either way `/data/identifiers` needs to enumerate pairs, or they stay
unreachable — the subject field is how anything gets loaded.

## 3. An adjusted price series (BU-106)

The Prices view had an "Adjusted" toggle that was never wired, and it turns
out there was nothing to wire it to: the market frame has no adjusted close,
and `/data/prices/{identifier}` takes `start`, `end`, `interval` and `columns`
— no `adjusted`. The button has been removed rather than left inert.

**Ask:** either an `ADJ_CLOSE` column on the market frame, or an `adjusted`
flag on the prices endpoint.

Deliberately not computed here. Corporate actions are available per
identifier, so the client _could_ apply them — but adjustment is the same
logic the index calculator already applies at rebalance, and a second
implementation in the renderer would drift from the one that produces the
official numbers.

## 4. A paged table endpoint (BU-102)

A "database view" — the stored data as it is, before any view shapes it — is
buildable per identifier from what exists. What is not buildable is browsing a
whole dataset: nothing serves one, and market data is millions of rows.

**Ask, if whole-table browsing is wanted:**
`GET /data/tables/{dataset}?offset=&limit=` returning the frame shape already
used everywhere, plus a total count. Paging is the whole point — an unbounded
dump is not something a client can render or an engine should build.

## Note: features need a regenerated store

Not an ask. `GET /data/features/catalogue` returns `{"types": [], "fields": []}`
and coverage reports `features: configured=false` on a store generated before
BN-140. Anyone building or testing against features needs a store made after
it — worth stating because the endpoints exist and answer emptily rather than
erroring, which reads as a client fault.
