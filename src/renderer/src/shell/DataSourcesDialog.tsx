import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { Badge } from '../components/Badge/Badge'
import { Button } from '../components/Button/Button'
import { describeSkipped } from '../views/shared/pickers'
import {
  refreshOf,
  removalOf,
  storeKind,
  unreadableReason,
  useActivateStore,
  useGenerateData,
  useImportFiles,
  useOpenFolder,
  useRefreshStore,
  useRemoveStore,
  useRenameStore,
  useStores,
  type DataStore
} from '../views/shared/storeQueries'
import { ViewError } from '../views/shared/ViewState'
import './DataSourcesDialog.css'

/** What a Data-menu item opened the dialog to do at once. */
export type SourcesStart = 'open-folder' | 'import'

export interface DataSourcesDialogProps {
  onClose: () => void
  /**
   * Go straight to a picker. The two actions that need one live here rather
   * than in the menu, because both can be refused with detail — a folder that
   * is not a store, an import's rows — and a menu item has nowhere to put it.
   */
  start?: SourcesStart
}

interface RowProps {
  store: DataStore
  renaming: boolean
  onStartRename: () => void
  onRename: (name: string) => void
  onCancelRename: () => void
  onUse: () => void
  onRefresh: () => void
  onRemove: () => void
}

/** When a store was last served, or that it never has been. */
function lastLoaded(store: DataStore): string {
  if (store.last_loaded_at == null) return 'never loaded'
  return `loaded ${store.last_loaded_at.slice(0, 10)}`
}

function NameField({
  initial,
  onRename,
  onCancel
}: {
  initial: string
  onRename: (name: string) => void
  onCancel: () => void
}): ReactElement {
  const [name, setName] = useState(initial)
  const field = useRef<HTMLInputElement>(null)
  const trimmed = name.trim()

  // The field exists because Rename was just pressed, so focus goes to it.
  useEffect(() => {
    field.current?.select()
  }, [])

  return (
    <input
      className="sources-rename type-11"
      aria-label="Store name"
      ref={field}
      value={name}
      spellCheck={false}
      onChange={(event) => {
        setName(event.target.value)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && trimmed !== '') onRename(trimmed)
        if (event.key === 'Escape') onCancel()
      }}
    />
  )
}

/**
 * One store, and what can be done with it.
 *
 * "Serving" is the engine's `active`, not anything remembered here. A store
 * that cannot be read — a folder moved or deleted since it was registered —
 * stays listed, because it is still registered and the reader has to be able
 * to remove it; it simply cannot be used.
 */
function StoreRow(props: RowProps): ReactElement {
  const { store } = props
  const refresh = refreshOf(store)

  return (
    <li className={store.active ? 'sources-row is-active' : 'sources-row'}>
      <div className="sources-main">
        {props.renaming ? (
          <NameField
            initial={store.name}
            onRename={props.onRename}
            onCancel={props.onCancelRename}
          />
        ) : (
          <span className="sources-name type-11">{store.name}</span>
        )}
        <Badge>{storeKind(store)}</Badge>
        {store.active && <span className="sources-serving type-11">serving</span>}
      </div>
      <p className="sources-meta type-11">
        {store.readable ? lastLoaded(store) : unreadableReason(store)} ·{' '}
        <span className="sources-path">{store.path}</span>
      </p>
      <div className="sources-actions">
        <Button onClick={props.onUse} disabled={store.active || !store.readable}>
          Use
        </Button>
        {/* Offered where the engine has a refresh for the store (BU-217), and
            disabled with the reason where the moment is wrong for one. */}
        <Button
          onClick={props.onRefresh}
          disabled={!refresh.available}
          {...(refresh.reason === undefined ? {} : { title: `Cannot refresh: ${refresh.reason}` })}
        >
          Refresh
        </Button>
        <Button onClick={props.onStartRename} disabled={props.renaming}>
          Rename
        </Button>
        {/* The engine refuses to remove the store it is serving, and saying
            so here is cheaper than a 409 after the confirm. */}
        <Button onClick={props.onRemove} disabled={store.active}>
          Remove
        </Button>
      </div>
    </li>
  )
}

/**
 * Where data comes from (BU-215).
 *
 * The engine's list of stores, and what to do with each. It replaces a window
 * built on a model py-beacon 0.1.2 retired: one store path the app owned, a
 * checkbox that generated data before the engine started, and a restart for
 * every change. The engine keeps the registry now and switches without a
 * restart, so this only asks it.
 *
 * A dialog in the main window rather than a window of its own, because it
 * needs what the main window already has — the engine connection, job
 * progress, and the data state that turns the footer red.
 */
export function DataSourcesDialog({ onClose, start }: DataSourcesDialogProps): ReactElement {
  const stores = useStores()
  const activate = useActivateStore()
  const rename = useRenameStore()
  const remove = useRemoveStore()
  const generate = useGenerateData()
  const open = useOpenFolder()
  const importFiles = useImportFiles()
  const refresh = useRefreshStore()
  const [renaming, setRenaming] = useState<string | undefined>(undefined)

  // `mutate` is stable across renders, so the pickers are too, and the
  // open-at-start effect below can name them without re-running.
  const openFolder = open.mutate
  const importPaths = importFiles.mutate

  // A dismissed picker is an answer, not an error: nothing happens.
  const pickFolder = useCallback((): void => {
    void window.beacon?.data.chooseStore().then(({ path }) => {
      if (path !== '') openFolder(path)
    })
  }, [openFolder])
  const pickFiles = useCallback((): void => {
    void window.beacon?.data.chooseFiles().then(({ paths }) => {
      if (paths.length > 0) importPaths(paths)
    })
  }, [importPaths])

  /*
   * Opened from the Data menu to do one thing at once. Once: StrictMode runs
   * effects twice in development, and the ref survives that where a second
   * native picker opening on top of the first would not be survivable.
   */
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    if (start === 'open-folder') pickFolder()
    if (start === 'import') pickFiles()
  }, [start, pickFolder, pickFiles])

  // Escape closes the dialog — unless a name is being edited, where it
  // cancels the edit instead, as it would in any field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && renaming === undefined) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, renaming])

  /*
   * Removing asks through the OS, with wording that depends on what it does.
   * A store the engine created goes with its files; a folder of the user's is
   * only forgotten. Only the first is destructive, and a single "Remove?"
   * would make them read alike.
   */
  const confirmRemove = (store: DataStore): void => {
    const { deletesFiles, detail } = removalOf(store)
    void window.beacon
      ?.confirm({
        title: deletesFiles ? 'Delete data store' : 'Forget data store',
        message: deletesFiles ? `Delete “${store.name}” and its files?` : `Forget “${store.name}”?`,
        detail,
        confirmLabel: deletesFiles ? 'Delete' : 'Forget'
      })
      .then((confirmed) => {
        if (confirmed) remove.mutate(store.id)
      })
  }

  const failed = [activate, rename, remove, generate, open, importFiles, refresh].find(
    (mutation) => mutation.isError
  )
  const busy = open.isPending || importFiles.isPending || generate.isPending
  const skipped = describeSkipped(stores.data)
  const list = stores.data?.stores ?? []

  return (
    <div
      className="sources-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="sources-dialog" role="dialog" aria-modal="true" aria-label="Data sources">
        <h2 className="sources-title type-13">Data sources</h2>
        <p className="sources-note type-11">
          Where the engine gets its data. Switching loads the new store without a restart.
        </p>

        {stores.isError && <ViewError error={stores.error} />}
        {skipped !== undefined && <p className="sources-note type-11">{skipped}</p>}

        {stores.isSuccess && list.length === 0 && (
          <p className="sources-note type-11">No data stores yet. Generate some to get started.</p>
        )}

        <ul className="sources-list">
          {list.map((store) => (
            <StoreRow
              key={store.id}
              store={store}
              renaming={renaming === store.id}
              onStartRename={() => {
                setRenaming(store.id)
              }}
              onRename={(name) => {
                rename.mutate({ id: store.id, name })
                setRenaming(undefined)
              }}
              onCancelRename={() => {
                setRenaming(undefined)
              }}
              onUse={() => {
                activate.mutate(store.id)
              }}
              onRefresh={() => {
                refresh.mutate(store.id)
              }}
              onRemove={() => {
                confirmRemove(store)
              }}
            />
          ))}
        </ul>

        {/* ViewError, not FaultNotice: a mutation can fail with no engine at
            all, which is a network error and carries no code to head by. */}
        {failed !== undefined && <ViewError error={failed.error} />}

        <div className="sources-footer">
          <div className="sources-add">
            <Button
              onClick={() => {
                generate.mutate()
              }}
              disabled={busy}
            >
              Generate synthetic data
            </Button>
            <Button onClick={pickFolder} disabled={busy}>
              Open a data folder…
            </Button>
            <Button onClick={pickFiles} disabled={busy}>
              Import files…
            </Button>
          </div>
          <Button variant="accent" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
