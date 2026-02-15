export type OutboxStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export type IntakePayload = {
  customerName: string;
  phone: string;
  destination: string;
  serviceType: 'depot' | 'door_to_door';
  cargoType: 'general' | 'barrel' | 'box' | 'vehicle' | 'machinery' | 'mixed' | 'other';
  pickupAddress?: string | null;
  pickupContactPhone?: string | null;
  notes?: string | null;
  occurredAtISO?: string | null; // when collection happened
};

export type OutboxItem = {
  id: string; // client_event_id (uuid)
  kind: 'intake_create';
  status: OutboxStatus;
  created_at: string;
  payload: IntakePayload;
  photos: File[];
  signature?: File | null;
  server?: { shipmentId: string; trackingCode: string } | null;
  error?: string | null;
};

const DB_NAME = 'cargopulse_offline';
const DB_VERSION = 1;
const STORE = 'outbox';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);

    Promise.resolve(fn(store))
      .then((reqOrValue: any) => {
        // If fn returned an IDBRequest, resolve it.
        if (reqOrValue && typeof reqOrValue === 'object' && 'onsuccess' in reqOrValue) {
          const req: IDBRequest<T> = reqOrValue;
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        } else {
          resolve(reqOrValue as T);
        }
      })
      .catch(reject);

    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function outboxPut(item: OutboxItem) {
  await withStore('readwrite', (store) => store.put(item));
}

export async function outboxGet(id: string): Promise<OutboxItem | null> {
  return (await withStore('readonly', (store) => store.get(id))) ?? null;
}

export async function outboxList(): Promise<OutboxItem[]> {
  const items = (await withStore('readonly', (store) => store.getAll())) as any[];
  return (items ?? []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export async function outboxPatch(id: string, patch: Partial<OutboxItem>) {
  const existing = await outboxGet(id);
  if (!existing) return;
  await outboxPut({ ...existing, ...patch });
}

export async function outboxDelete(id: string) {
  await withStore('readwrite', (store) => store.delete(id));
}

export function safeUuid(): string {
  const c: any = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  // fallback (not cryptographically perfect, but fine for client idempotency)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.random() * 16 | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
