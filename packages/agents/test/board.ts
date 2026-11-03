import {
  acceptEvent,
  eventMatches,
  isDue,
  sameStoredEvent,
  selectEvents,
  validateFilter,
} from "@ix/distribution";
import type { Clock, EventFilter, StoredEvent } from "@ix/distribution";
import type { JobBoard } from "../src/index.js";

type Subscription = {
  readonly filter: EventFilter;
  readonly listener: (event: StoredEvent) => void;
  active: boolean;
};

export function createTestBoard(clock: Clock): JobBoard {
  const events: StoredEvent[] = [];
  const subscriptions: Subscription[] = [];
  return {
    publish(input) {
      const accepted = acceptEvent(input);
      if (!accepted.ok) {
        return accepted;
      }
      if (isDue(accepted.event.expiresAt, clock.now())) {
        return { ok: false, reason: "expired", detail: "The event is already expired." };
      }
      for (const existing of events) {
        if (existing.id !== accepted.event.id) {
          continue;
        }
        if (sameStoredEvent(existing, accepted.event)) {
          return { ok: true, event: existing };
        }
        return { ok: false, reason: "id_conflict", detail: "An event with this id is already stored." };
      }
      events.push(accepted.event);
      for (const subscription of subscriptions) {
        if (!subscription.active) {
          continue;
        }
        if (eventMatches(accepted.event, subscription.filter)) {
          subscription.listener(accepted.event);
        }
      }
      return { ok: true, event: accepted.event };
    },
    query(filter) {
      const checked = validateFilter(filter, "query");
      if (!checked.ok) {
        return checked;
      }
      return { ok: true, events: selectEvents(events, filter, clock.now()) };
    },
    subscribe(filter, listener) {
      const checked = validateFilter(filter, "subscribe");
      if (!checked.ok) {
        return checked;
      }
      const subscription: Subscription = { filter, listener, active: true };
      subscriptions.push(subscription);
      return {
        ok: true,
        id: `sub-${String(subscriptions.length)}`,
        close() {
          subscription.active = false;
        },
      };
    },
  };
}
