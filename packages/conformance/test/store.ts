import { copyStoredEvent, isDue, readInstant, sameStoredEvent } from "@ix/distribution";
import type { EventStore, StoredEvent } from "@ix/distribution";

export function createConformanceStore(): EventStore {
  const events: StoredEvent[] = [];
  return {
    put(event) {
      for (const existing of events) {
        if (existing.id !== event.id) {
          continue;
        }
        if (sameStoredEvent(existing, event)) {
          return { status: "duplicate", event: copyStoredEvent(existing) };
        }
        return { status: "conflict" };
      }
      const stored = copyStoredEvent(event);
      events.push(stored);
      return { status: "inserted", event: copyStoredEvent(stored) };
    },
    deleteExpired(now) {
      readInstant(now);
      const kept: StoredEvent[] = [];
      for (const event of events) {
        if (!isDue(event.expiresAt, now)) {
          kept.push(event);
        }
      }
      events.length = 0;
      for (const event of kept) {
        events.push(event);
      }
    },
    list() {
      const copy: StoredEvent[] = [];
      for (const event of events) {
        copy.push(copyStoredEvent(event));
      }
      return copy;
    },
  };
}
