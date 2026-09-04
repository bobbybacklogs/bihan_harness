import { EventEmitter } from 'events';

export interface IceboxEntry<T = any> {
  key: string;
  value: T;
  frozenBy: string;
  timestamp: number;
  metadata?: Record<string, any>;
  sizeBytes?: number;
}

export class Icebox extends EventEmitter {
  private store: Map<string, IceboxEntry> = new Map();

  /**
   * Freeze (store) a value in the shared icebox.
   */
  freeze<T = any>(
    key: string,
    value: T,
    options: { frozenBy?: string; metadata?: Record<string, any> } = {}
  ): IceboxEntry<T> {
    const rawStr = typeof value === 'string' ? value : JSON.stringify(value);
    const sizeBytes = Buffer.byteLength(rawStr, 'utf8');

    const entry: IceboxEntry<T> = {
      key,
      value,
      frozenBy: options.frozenBy || 'system',
      timestamp: Date.now(),
      metadata: options.metadata,
      sizeBytes,
    };

    this.store.set(key, entry);
    this.emit('frozen', entry);
    return entry;
  }

  /**
   * Thaw (retrieve) a value from the shared icebox.
   */
  thaw<T = any>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    this.emit('thawed', { key, entry });
    return entry.value as T;
  }

  getEntry<T = any>(key: string): IceboxEntry<T> | undefined {
    return this.store.get(key) as IceboxEntry<T> | undefined;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  delete(key: string): boolean {
    const deleted = this.store.delete(key);
    if (deleted) this.emit('deleted', key);
    return deleted;
  }

  clear(): void {
    this.store.clear();
    this.emit('cleared');
  }

  /**
   * List all stored keys with summary metadata (to keep token context small).
   */
  list(): Array<{ key: string; frozenBy: string; sizeBytes?: number; timestamp: number }> {
    return Array.from(this.store.values()).map((e) => ({
      key: e.key,
      frozenBy: e.frozenBy,
      sizeBytes: e.sizeBytes,
      timestamp: e.timestamp,
    }));
  }
}
