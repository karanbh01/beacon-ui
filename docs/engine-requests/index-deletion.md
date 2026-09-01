# An index cannot be deleted

`/indices/{index_id}` answers GET and PUT. There is no DELETE, and no other
route removes a stored index definition — so an index created by mistake, or
one made while trying something out, is permanent from the app's side.

Universes already have this: `DELETE /universes/{universe_id}` exists, refuses
a seeded universe, and is what BU-144 wired up. Indices are the same kind of
document in the same kind of store, and the asymmetry is the whole of this
request.

## What the client would do with it

`DELETE /indices/{index_id}`, with the engine's own rules about what may go:

- **404** for an index that is not there, as the GET does.
- **422** — or whatever the engine considers the honest refusal — for one that
  cannot be deleted, if the engine decides some cannot. A seeded or built-in
  index would be the obvious case, mirroring a seeded universe.
- **204** on success.

The app would confirm first through the OS dialog, as it does for a universe
and for replacing the data store, and would say in that dialog what the delete
costs — which raises the one question worth deciding in py-beacon rather than
here:

## What happens to a backtest of a deleted index?

Results are keyed `backtest:{index_id}` in the job registry and persisted.
Deleting the definition leaves them addressable by an id that no longer
resolves — `/beacon/{index_id}/overview` would 404 on the definition load
before it reached them.

Three defensible answers, and this app can render any of them; it just needs
to know which:

1. **Cascade.** The results go with the definition. Simplest to explain, and
   the delete dialog can say "and its backtest results".
2. **Orphan and keep.** The results stay readable by id. Then the app should
   say the definition is gone but the run survives, which needs a way to tell
   the two states apart.
3. **Refuse.** An index with results cannot be deleted until they are. Honest,
   but it makes the common case — delete the thing I just made by mistake —
   the awkward one.

The first is what BU-144 assumes for now, because it is the only one that
needs nothing new on the wire.

## Meanwhile

The app deletes universes and does not offer to delete indices, rather than
offering a button that fails. Filed from beacon-ui BU-144.
