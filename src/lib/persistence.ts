/**
 * File System Access API handles are live JavaScript objects that
 * cannot be serialised to JSON, but the browser can structured-clone
 * them into IndexedDB. Once persisted, the same handle reappears in
 * a future session with its permission state intact: the user only
 * has to grant "Allow this site to view and copy files?" once per
 * origin + directory, after which every re-load reads the handle
 * directly with no further dialog.
 *
 * Each handle is stored as a single record keyed by its `kind`
 * ("input" or "output") so a single object store covers both the
 * input and output folder slots without growing per-folder.
 */

const DB_NAME = "elastic-wave-analyzer";
const DB_VERSION = 1;
const STORE_NAME = "folder-handles";

/** Slots the persistence layer knows how to save and restore. */
export type FolderSlot = "output";

/** Combined record shape stored in IndexedDB. */
type StoredHandle = {
  kind: FolderSlot;
  handle: FileSystemDirectoryHandle;
};

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Open (and lazily create) the IndexedDB database used for handle
 * persistence. The connection is cached so a page-long session only
 * pays the open-once cost; onupgradeneeded runs exactly once when
 * the version bumps.
 */
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Single object store keyed by slot name. unique = true on the
      // implicit keypath means only one record per kind is ever kept,
      // which is exactly the "current output folder" model the UI
      // exposes.
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "kind" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

/**
 * Wrap an IDBRequest so the surrounding code can `await` the
 * success/error transition without nesting onsuccess/onerror.
 */
function awaitRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

/**
 * Persist `handle` under the named slot, replacing any prior record.
 * Best-effort: a quota or permission failure must never break the
 * app, so the rejection is intentionally swallowed at the call site
 * with a notice. The handle is structured-cloned into IndexedDB
 * alongside the slot name as the primary key.
 */
export async function saveFolderHandle(
  slot: FolderSlot,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const record: StoredHandle = { kind: slot, handle };
  await awaitRequest(store.put(record));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

/**
 * Load a previously persisted handle for the named slot, asking the
 * browser to (re-)grant permission if necessary. Returns null when
 * nothing is stored, the user denies a re-prompt, or the browser
 * refused to grant access. The caller is expected to surface a
 * notice in the latter cases.
 */
export async function loadFolderHandle(
  slot: FolderSlot,
): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const record = (await awaitRequest(store.get(slot))) as
    | StoredHandle
    | undefined;
  if (!record) return null;
  const handle = record.handle;
  // Permission is the only thing that can fail at restore time:
  // a stored handle is useless if the browser decides the user
  // revoked access in between sessions.
  if (await handle.queryPermission({ mode: "readwrite" }) === "granted") {
    return handle;
  }
  if (await handle.requestPermission({ mode: "readwrite" }) === "granted") {
    return handle;
  }
  return null;
}

/**
 * Convenience wrappers that scope the slot name to the only
 * currently-persisted folder (output). Kept as named functions so
 * App.tsx does not have to import the `FolderSlot` union.
 */
export const saveOutputFolderHandle = (handle: FileSystemDirectoryHandle) =>
  saveFolderHandle("output", handle);

export const loadOutputFolderHandle = () => loadFolderHandle("output");
