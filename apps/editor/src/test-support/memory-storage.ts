/** Web storage holding its items in memory, in insertion order. */
export class MemoryStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length"> {
  private readonly _items = new Map<string, string>();

  get length(): number {
    return this._items.size;
  }

  key(index: number): string | null {
    return [...this._items.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this._items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this._items.set(key, value);
  }

  removeItem(key: string): void {
    this._items.delete(key);
  }

  /** A copy of every item, as a duplicated tab's `sessionStorage` starts. */
  copy(): MemoryStorage {
    const copy = new MemoryStorage();
    for (const [key, value] of this._items) copy.setItem(key, value);
    return copy;
  }
}
