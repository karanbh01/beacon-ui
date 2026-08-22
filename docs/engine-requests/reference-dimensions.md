# Reference dimensions the universe builder needs

**For:** py-beacon
**From:** beacon-ui, BU-85
**Status:** region and country delivered (BN-128); market cap outstanding

## What this is

The Universe Set view can now build a universe by filtering the loaded
dataset, the way an index is built. The filters are **derived from whatever
columns `GET /data/reference` returns** rather than hard-coded, so anything
py-beacon publishes becomes a control with no client change. This document
records the dimensions that were asked for and are not currently reachable.

## What the endpoint returns today

Probed against a running engine, `GET /data/reference?identifiers=…&fields=adv_3m`
over the 512 members of the seeded `GLOBAL` universe:

| column                 | kind             | distinct values | becomes                                              |
| ---------------------- | ---------------- | --------------- | ---------------------------------------------------- |
| `NAME`                 | string           | 512             | excluded — an identity, not a dimension              |
| `SECTOR`               | string           | 11              | category filter                                      |
| `SUB_INDUSTRY`         | string           | 33              | category filter                                      |
| `EXCHANGE`             | string           | 2               | category filter                                      |
| `CURRENCY`             | string           | 1               | dropped — one value narrows nothing                  |
| `DATE_FROM`, `DATE_TO` | date             | —               | excluded — they describe the row, not the instrument |
| `adv_3m`               | number (derived) | —               | range filter, and rankable                           |

Note that `adv_3m` is returned **only when named in `fields`**. Naming no
stored columns returns all of them, which is how the client asks: `fields=adv_3m`
alone, so no column name is hard-coded on this side.

## What is missing

### 1. `REGION` — highest value

Asked for by name. `beacon/reference/regions.py` already computes a region and
is explicit that it is "deliberately _not_ a country", but the value does not
reach the stored reference frame, so no client can read it.

**Ask:** expose the computed region as a `REGION` column on the reference
frame, with the same values `regions.py` already assigns.

### 2. `COUNTRY`

Distinct from region and asked for separately — "US, Europe" is a region
question, "listed in Germany" is a country one, and merging them makes both
worse. `EXCHANGE` is the only proxy available today, and it answers neither
question well: `XNAS` and `XNYS` are both the United States.

**Ask:** a `COUNTRY` column, ISO 3166-1 alpha-2, of the listing venue. If the
domicile differs from the listing country and both are known, two columns
(`COUNTRY_LISTING`, `COUNTRY_DOMICILE`) are better than one that silently
picks.

### 3. Market capitalisation

No market cap of any kind exists on the reference frame — not
`MARKET_CAP`, not free float. The Universe Set table has drawn an "FF Mkt Cap
($B)" column since it was built to the Figma frame, and it has been showing
`—` for every row against a real engine.

`shares_outstanding` is already on `ConstituentRow`, so the inputs exist
somewhere. A point-in-time market cap is a price times a share count, which is
a market-data join rather than a static attribute — hence stating it as a
derived field rather than a stored column.

**Ask:** `market_cap` and `free_float_market_cap` as **derived** reference
fields, alongside `adv_3m`, resolved as of the same date the endpoint uses for
`adv_3m`. Derived is the right shape for the same reason `adv_3m` is: they are
computed from market data, they change daily, and a client should have to name
them to pay for them.

## What the client does when these land

Nothing — which BN-128 demonstrated. Region, both country columns and a
seven-valued currency became six new filters with no client change at all. `filtersFor` in `src/renderer/src/views/universe/builder.ts` turns
every categorical column below 60 distinct values into a checkbox group and
every numeric one into a range with a rank, sorted categories-first. A
`REGION` column appears as a Region filter the moment it is returned, and a
derived `free_float_market_cap` becomes both a range filter and a rank key —
and fills the table column that is already drawn for it.

The one thing worth coordinating: if market cap arrives as a **stored** column
rather than a derived one, the client's request is already `fields=adv_3m`,
which returns all stored columns, so it would appear with no change either
way.

## Related

- `BN-65` added a `universes` array to `GET /data/reference/{identifier}`,
  naming the universes that contain an instrument. Not consumed by the client
  yet; it is the natural source for a "which universes is this in?" line on
  the Reference Data view.

---

## Addendum: a timestamp on a universe document (BU-93)

Universe Set now opens on an overview — one row per universe, with its name
and constituent count. `GET /universes` already returns each universe's whole
`identifiers` array alongside its name, so the counts cost nothing extra.

What the overview cannot show is **when a universe was last written**. The
`Universe` schema carries `id`, `name`, `description`, `source` and
`identifiers` — no created, no updated. So an "as of" column can only report
the date the _dataset_ is current to, which is the same value in every row and
is only truthful for the seeded universe: that one genuinely tracks the data,
while a user's is whatever they last saved.

**Ask:** `created_at` and `updated_at` on the universe document, ISO 8601, set
by the store on write. The document is already persisted as a file per
universe, so the write path is the only place that needs to stamp it.

Small, but it turns a column that is the same everywhere into one that answers
"is this list stale?" — which is the question anyone scanning a list of
universes is actually asking.
