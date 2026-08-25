# Data py-beacon does not serve yet

**For:** py-beacon
**From:** beacon-ui, BU-100 / BU-101 / BU-102 / BU-106
**Status:** FX, adjusted prices and the paged table endpoint all delivered; market cap outstanding

Four asks, all found while building against a running engine at
`c8f53f1` (BN-142). Each says what was checked, so none of it has to be
taken on trust.

## ~~1. FX in the coverage report~~ — delivered

BN-145 reports `fx` on the same `DatasetCoverage` shape as the others, and the
Coverage view needed no change beyond spelling the label `FX` rather than
`Fx`. Original ask below.

### 1. FX in the coverage report (BU-100)

`GET /data/coverage` returns `market`, `reference`, `corporate_actions` and
`features`. There is no `fx` row, though the generator writes one —
`Generated 6 FX pair(s): EURUSD, HKDUSD, JPYUSD, GBPUSD, CADUSD, AUDUSD`.

**Ask:** an `fx` entry on the same `DatasetCoverage` shape as the others.
`identifiers` is naturally the pair count.

The Coverage view renders whatever rows come back, so nothing changes here
once the engine sends it.

## ~~2. FX rates as a series~~ — delivered, the preferred way

BN-144 made pairs addressable through the existing prices endpoint, which is
option 1 below — so the Prices view, its chart and the typeahead all worked
with no client change at all. `/data/identifiers?q=EUR` returns `EURUSD` with
`datasets: ["market"]`. Original ask below.

### 2. FX rates as a series (BU-101)

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

## ~~3. An adjusted price series~~ — delivered

BN-146 added an `adjusted` flag that ADDS an `ADJ_CLOSE` column rather than
replacing `CLOSE`, which is the better shape: the table can show both. The
control removed in BU-106 is back. Original ask below.

### 3. An adjusted price series (BU-106)

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

## ~~4. A paged table endpoint~~ — delivered, not yet consumed

BN-147 added `GET /data/tables/{dataset}` with `offset` and `limit`. The
Database view still reads per identifier and does not use it yet — whole-table
browsing is a follow-up. Original ask below.

### 4. A paged table endpoint (BU-102)

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

---

## Addendum: an identifier filter on the table endpoint (BU-113)

BN-147's `GET /data/tables/{dataset}` returns exactly the shape a history view
needs. For features:

```
columns : IDENTIFIER, DATE, TYPE, FIELD, VALUE, DETAIL
total   : 969,992
row 0   : CMPA | 2016-11-27 | fundamentals | pe_ratio | 10.4482 | period ending 2016-09-30, reported 2016Q3
```

Every historical value is there, dated and attributed. What is missing is a
way to ask for one name's rows. The endpoint takes only `offset` and `limit`;
passing `identifiers=CMPA` is ignored, and the total comes back as 969,992
either way — verified against a running engine. Paging the whole table to
find one instrument's ~180 rows is 970 requests for 0.02% of the payload.

**Ask:** an `identifiers` filter on `GET /data/tables/{dataset}`,
comma-separated or repeated, exactly as `/data/reference` already accepts.

That endpoint already returns the right columns and already pages, so this is
the smallest change that unblocks a Features history view — and it serves the
Database view's whole-table browsing at the same time. A
`/data/features/{identifier}/history` would also work but adds an endpoint
where a parameter would do.
