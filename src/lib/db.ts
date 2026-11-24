import type { AppSettings, Plot, Scheme } from '../types'
import { DEFAULT_SETTINGS } from './defaults'
import { buildSeedPlots, buildSeedSchemes } from './seed'

const DB_NAME = 'grape-canopy-light-lab'
const DB_VERSION = 1
const SETTINGS_KEY = 'app-settings'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('plots')) db.createObjectStore('plots', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('schemes')) {
        const store = db.createObjectStore('schemes', { keyPath: 'id' })
        store.createIndex('plotId', 'plotId', { unique: false })
      }
      if (!db.objectStoreNames.contains('runs')) {
        const store = db.createObjectStore('runs', { keyPath: 'id' })
        store.createIndex('schemeId', 'schemeId', { unique: false })
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

function tx<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const request = fn(transaction.objectStore(storeName))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }))
}

export const db = {
  getAllPlots: () => tx<Plot[]>('plots', 'readonly', (s) => s.getAll() as IDBRequest<Plot[]>),
  putPlot: (plot: Plot) => tx<IDBValidKey>('plots', 'readwrite', (s) => s.put(plot)),
  deletePlot: (id: string) => tx<undefined>('plots', 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>),

  getAllSchemes: () => tx<Scheme[]>('schemes', 'readonly', (s) => s.getAll() as IDBRequest<Scheme[]>),
  putScheme: (scheme: Scheme) => tx<IDBValidKey>('schemes', 'readwrite', (s) => s.put(scheme)),
  deleteScheme: (id: string) => tx<undefined>('schemes', 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>),
  deleteSchemesByPlot: async (plotId: string) => {
    const schemes = await db.getAllSchemes()
    await Promise.all(schemes.filter((s) => s.plotId === plotId).map((s) => db.deleteScheme(s.id)))
  },

  async getSettings(): Promise<AppSettings> {
    const row = await tx<{ key: string; value: AppSettings } | undefined>(
      'kv',
      'readonly',
      (s) => s.get(SETTINGS_KEY) as IDBRequest<{ key: string; value: AppSettings } | undefined>
    )
    return row?.value ?? DEFAULT_SETTINGS
  },
  putSettings: (value: AppSettings) => tx<IDBValidKey>('kv', 'readwrite', (s) => s.put({ key: SETTINGS_KEY, value })),

  async seedIfNeeded() {
    const plots = await db.getAllPlots()
    if (plots.length > 0) return false
    const seedPlots = buildSeedPlots()
    const seedSchemes = buildSeedSchemes(seedPlots)
    for (const plot of seedPlots) await db.putPlot(plot)
    for (const scheme of seedSchemes) await db.putScheme(scheme)
    await db.putSettings(DEFAULT_SETTINGS)
    return true
  },

  async resetSeedData() {
    const plots = buildSeedPlots()
    const schemes = buildSeedSchemes(plots)
    const existingSchemes = await db.getAllSchemes()
    const existingPlots = await db.getAllPlots()
    await Promise.all(existingSchemes.map((s) => db.deleteScheme(s.id)))
    await Promise.all(existingPlots.map((p) => db.deletePlot(p.id)))
    for (const plot of plots) await db.putPlot(plot)
    for (const scheme of schemes) await db.putScheme(scheme)
    await db.putSettings(DEFAULT_SETTINGS)
  }
}
