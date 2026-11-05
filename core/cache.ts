interface CacheEntry {
  expires: number;
  pending: boolean;
  promise: Promise<unknown>;
}

/** Main-process memory only. Concurrent reads share a request; errors never cache. */
export class RequestCache {
  private entries = new Map<string, CacheEntry>();
  constructor(private now: () => number = Date.now, private capacity = 128) {}

  clear(): void { this.entries.clear(); }

  get<T>(key: string, ttl: number, load: () => Promise<T>, force = false): Promise<T> {
    const existing = this.entries.get(key);
    if (existing && (existing.pending || (!force && this.now() < existing.expires)))
      return existing.promise as Promise<T>;

    const entry: CacheEntry = { expires: 0, pending: true, promise: Promise.resolve() };
    entry.promise = Promise.resolve().then(load).then(value => {
      if (this.entries.get(key) === entry) {
        entry.pending = false;
        entry.expires = this.now() + ttl;
      }
      return value;
    }, error => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    });
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
    return entry.promise as Promise<T>;
  }
}
