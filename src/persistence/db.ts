// IndexedDB 保存（端末内のみ。外部送信しない）
import { openDB, type IDBPDatabase } from 'idb';
import type { BoardDoc } from '../domain/document';

const DB_NAME = 'boccia-strategy-board';
const DB_VERSION = 1;

export interface DocSummary {
  id: string;
  title: string;
  mode: BoardDoc['mode'];
  profileId: BoardDoc['profileId'];
  updatedAt: string;
  createdAt: string;
  variantCount: number;
}

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbp) {
    dbp = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      },
    });
  }
  return dbp;
}

export async function putDoc(doc: BoardDoc): Promise<void> {
  await (await db()).put('docs', doc);
}

export async function getDoc(id: string): Promise<BoardDoc | undefined> {
  return (await db()).get('docs', id);
}

export async function deleteDoc(id: string): Promise<void> {
  await (await db()).delete('docs', id);
}

export async function listDocs(): Promise<DocSummary[]> {
  const all = (await (await db()).getAll('docs')) as BoardDoc[];
  return all
    .map((d) => ({
      id: d.id,
      title: d.title,
      mode: d.mode,
      profileId: d.profileId,
      updatedAt: d.updatedAt,
      createdAt: d.createdAt,
      variantCount: d.variants.length,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db()).get('meta', key);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', value, key);
}
