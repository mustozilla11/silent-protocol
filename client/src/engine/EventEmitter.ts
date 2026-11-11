/**
 * Hafif ve tip-güvenli (typed) EventEmitter implementasyonu.
 * 3D sahne (/render) ve HTML arayüzü (/ui) yalnızca bu olaylara abone olur.
 */
export type Listener<T> = (payload: T) => void;

export class EventEmitter<Events extends { [K in keyof Events]: Events[K] }> {
  private listeners = new Map<keyof Events, Set<Listener<unknown>>>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<unknown>);
    return () => this.off(event, listener);
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const wrapper: Listener<Events[K]> = (payload) => {
      this.off(event, wrapper);
      listener(payload);
    };
    return this.on(event, wrapper);
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(listener as Listener<unknown>);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of Array.from(set)) {
      (listener as Listener<Events[K]>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
