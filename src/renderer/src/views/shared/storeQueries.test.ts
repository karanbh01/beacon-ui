import { describe, expect, it } from 'vitest'
import { refreshOf, removalOf, storeKind, unreadableReason, type DataStore } from './storeQueries'

/**
 * What a reader needs to know about a data store before acting on it
 * (BU-215). The labels carry one distinction above all: whether removing the
 * store deletes files, which only a store the engine created does.
 */

const store = (over: Partial<DataStore>): DataStore => ({
  id: 'x',
  name: 'X',
  kind: 'folder',
  path: 'D:/data/x',
  source: 'local',
  managed: false,
  active: false,
  readable: true,
  created_at: '2026-09-25T00:00:00Z',
  last_loaded_at: null,
  size_bytes: 1,
  connection: null,
  refresh_from: 'source',
  refresh: 'reread',
  ...over
})

describe('what a store is', () => {
  it('names generated and imported stores by where their rows came from', () => {
    expect(storeKind(store({ source: 'synthetic', managed: true }))).toBe('Generated')
    expect(storeKind(store({ source: 'imported', managed: true }))).toBe('Imported')
  })

  it('names a registered folder as the reader’s own', () => {
    expect(storeKind(store({ source: 'local', managed: false }))).toBe('Your folder')
  })

  it('names a database as one, whatever its source says', () => {
    expect(storeKind(store({ kind: 'postgres', source: 'database' }))).toBe('Database')
  })
})

describe('what removing a store does', () => {
  it('deletes the files of a store the engine created, and says so', () => {
    const removal = removalOf(store({ source: 'synthetic', managed: true }))
    expect(removal.deletesFiles).toBe(true)
    expect(removal.detail).toContain('cannot be undone')
  })

  it('only forgets a folder of the reader’s, and names the folder left alone', () => {
    const removal = removalOf(store({ path: 'D:/my/prices' }))
    expect(removal.deletesFiles).toBe(false)
    expect(removal.detail).toContain('D:/my/prices is not touched')
  })

  it('only forgets a database, without promising anything about a folder', () => {
    // Read-only to Beacon and never managed: "the folder is not touched"
    // would be the wrong promise for something that is not a folder.
    const removal = removalOf(store({ kind: 'postgres', source: 'database' }))
    expect(removal.deletesFiles).toBe(false)
    expect(removal.detail).not.toContain('folder')
    expect(removal.detail).toContain('Nothing in it is changed')
  })
})

describe('why a store cannot be read', () => {
  it('suspects a moved folder for a folder', () => {
    expect(unreadableReason(store({ readable: false }))).toContain('moved or deleted')
  })

  it('names the missing password variable for a database', () => {
    /*
     * The only way a database store is unreadable in the listing, which never
     * connects: the variable holding its password is not set. "Moved or
     * deleted?" would send a reader looking for a folder that never existed.
     */
    const database = store({
      kind: 'postgres',
      readable: false,
      connection: {
        host: 'db',
        port: 5432,
        database: 'prices',
        schema: 'public',
        user: 'karan',
        password_env: 'PRICES_PASSWORD'
      }
    })
    expect(unreadableReason(database)).toContain('PRICES_PASSWORD is not set')
    expect(unreadableReason(database)).not.toContain('moved')
  })
})

describe('when a store can be refreshed', () => {
  it('follows the engine: a store with no refresh has none to offer', () => {
    // Imported files, and synthetic data made before py-beacon 0.1.2.
    const imported = refreshOf(store({ source: 'imported', managed: true, refresh: null }))
    expect(imported.available).toBe(false)
    expect(imported.reason).toContain('importing them again')
  })

  it('re-reads only the store being served', () => {
    /*
     * A store not being served is read fresh when it is used, so the engine
     * refuses to re-read it. Offering the button anyway would be a 409 after
     * the click.
     */
    expect(refreshOf(store({ refresh: 'reread', active: false })).available).toBe(false)
    expect(refreshOf(store({ refresh: 'reread', active: true })).available).toBe(true)
  })

  it('extends synthetic data whether or not it is served', () => {
    // Extending writes new days into the store itself, served or not.
    const synthetic = store({ source: 'synthetic', managed: true, refresh: 'extend' })
    expect(refreshOf(synthetic).available).toBe(true)
  })
})
