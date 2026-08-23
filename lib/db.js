import { canonicalJobUrl } from "./normalize.js";

const DB_NAME = "application-tracker";
const DB_VERSION = 1;
const STORE = "applications";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("appliedAt", "appliedAt");
        store.createIndex("status", "status");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function recordTime(record) {
  return record.updatedAt || record.appliedAt || "";
}

export function duplicateIdsToDelete(records) {
  const newestByUrl = new Map();
  const duplicateIds = [];
  const sorted = [...records].sort((a, b) => recordTime(b).localeCompare(recordTime(a)));
  for (const record of sorted) {
    const url = canonicalJobUrl(record.url);
    if (!url) continue;
    if (newestByUrl.has(url)) duplicateIds.push(record.id);
    else newestByUrl.set(url, record.id);
  }
  return duplicateIds;
}

export async function saveApplication(application) {
  const db = await openDatabase();
  const transaction = db.transaction(STORE, "readwrite");
  const store = transaction.objectStore(STORE);
  const request = store.getAll();
  request.onsuccess = () => {
    const records = request.result.filter((record) => record.id !== application.id);
    for (const record of records) {
      if (canonicalJobUrl(record.url) && canonicalJobUrl(record.url) === canonicalJobUrl(application.url)) store.delete(record.id);
    }
    store.put(application);
  };
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(application);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }).finally(() => db.close());
}

export async function deduplicateApplicationsByUrl() {
  const db = await openDatabase();
  const transaction = db.transaction(STORE, "readwrite");
  const store = transaction.objectStore(STORE);
  const request = store.getAll();
  let removed = 0;
  request.onsuccess = () => {
    const duplicateIds = duplicateIdsToDelete(request.result);
    removed = duplicateIds.length;
    for (const id of duplicateIds) store.delete(id);
  };
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(removed);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }).finally(() => db.close());
}

export async function listApplications() {
  const db = await openDatabase();
  const transaction = db.transaction(STORE, "readonly");
  const records = await requestResult(transaction.objectStore(STORE).getAll());
  db.close();
  return records.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export async function findApplicationByUrl(url) {
  const target = canonicalJobUrl(url);
  if (!target) return undefined;
  const records = await listApplications();
  return records.find((record) => canonicalJobUrl(record.url) === target);
}

export async function getApplication(id) {
  const db = await openDatabase();
  const transaction = db.transaction(STORE, "readonly");
  const record = await requestResult(transaction.objectStore(STORE).get(id));
  db.close();
  return record;
}

export async function deleteApplication(id) {
  const db = await openDatabase();
  const transaction = db.transaction(STORE, "readwrite");
  transaction.objectStore(STORE).delete(id);
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  }).finally(() => db.close());
}
