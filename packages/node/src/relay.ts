import { readNodeMode } from "@ix/config";
import type { NodeMode } from "@ix/config";
import {
  acceptEvent,
  eventMatches,
  isDue,
  readInstant,
  selectEvents,
  validateFilter,
} from "@ix/distribution";
import type {
  AcceptReason,
  Clock,
  EventFilter,
  EventStore,
  RelayEventInput,
  StoredEvent,
  TagConstraint,
} from "@ix/distribution";

export type PublishReason =
  | AcceptReason
  | "expired"
  | "id_conflict"
  | "public_publish_refused";

export type PublishResult =
  | { readonly ok: true; readonly duplicate: boolean; readonly event: StoredEvent }
  | { readonly ok: false; readonly reason: PublishReason; readonly detail: string };

export type QueryResult =
  | { readonly ok: true; readonly events: readonly StoredEvent[] }
  | { readonly ok: false; readonly reason: "bad_filter"; readonly detail: string };

export type EventListener = (event: StoredEvent) => void;

export type SubscribeResult =
  | { readonly ok: true; readonly id: string; readonly close: () => void }
  | { readonly ok: false; readonly reason: "bad_filter"; readonly detail: string };

export type Relay = {
  readonly mode: NodeMode;
  readonly acceptsPublicPublish: boolean;
  readonly publish: (input: RelayEventInput) => PublishResult;
  readonly query: (filter: EventFilter) => QueryResult;
  readonly subscribe: (filter: EventFilter, listener: EventListener) => SubscribeResult;
};

type LiveSubscription = {
  readonly id: string;
  readonly filter: EventFilter;
  readonly listener: EventListener;
  active: boolean;
};

export function createRelay(input: {
  readonly mode: string;
  readonly store: EventStore;
  readonly clock: Clock;
}): Relay {
  const mode = readNodeMode(input.mode);
  const acceptsPublicPublish = mode === "open";
  const store = input.store;
  const clock = input.clock;
  const subscriptions: LiveSubscription[] = [];
  let nextId = 1;

  return {
    mode,
    acceptsPublicPublish,
    publish(eventInput) {
      if (!acceptsPublicPublish) {
        return {
          ok: false,
          reason: "public_publish_refused",
          detail: "A closed node does not accept public publish.",
        };
      }
      const now = readNow(clock);
      store.deleteExpired(now);
      const accepted = acceptEvent(eventInput);
      if (!accepted.ok) {
        return accepted;
      }
      if (isDue(accepted.event.expiresAt, now)) {
        return {
          ok: false,
          reason: "expired",
          detail: "The event is already expired.",
        };
      }
      const put = store.put(accepted.event);
      if (put.status === "conflict") {
        return {
          ok: false,
          reason: "id_conflict",
          detail: "An event with this id is already stored with different content.",
        };
      }
      if (put.status === "inserted") {
        notify(subscriptions, put.event);
        return { ok: true, duplicate: false, event: put.event };
      }
      return { ok: true, duplicate: true, event: put.event };
    },
    query(filter) {
      const checked = validateFilter(filter, "query");
      if (!checked.ok) {
        return checked;
      }
      const now = readNow(clock);
      store.deleteExpired(now);
      return { ok: true, events: selectEvents(store.list(), filter, now) };
    },
    subscribe(filter, listener) {
      const checked = validateFilter(filter, "subscribe");
      if (!checked.ok) {
        return checked;
      }
      const now = readNow(clock);
      store.deleteExpired(now);
      const id = `sub-${String(nextId)}`;
      nextId += 1;
      const subscription: LiveSubscription = {
        id,
        filter: copyFilter(filter),
        listener,
        active: true,
      };
      subscriptions.push(subscription);
      return {
        ok: true,
        id,
        close() {
          subscription.active = false;
          const index = subscriptions.indexOf(subscription);
          if (index < 0) {
            return;
          }
          subscriptions.splice(index, 1);
        },
      };
    },
  };
}

function readNow(clock: Clock): string {
  const now = clock.now();
  readInstant(now);
  return now;
}

function notify(subscriptions: readonly LiveSubscription[], event: StoredEvent): void {
  const snapshot = subscriptions.slice();
  for (const subscription of snapshot) {
    if (!subscription.active) {
      continue;
    }
    if (!eventMatches(event, subscription.filter)) {
      continue;
    }
    subscription.listener(event);
  }
}

function copyFilter(filter: EventFilter): EventFilter {
  const copy: {
    ids?: readonly string[];
    issuers?: readonly string[];
    kinds?: readonly string[];
    tags?: readonly TagConstraint[];
    since?: string;
    until?: string;
    limit?: number;
  } = {};
  if (filter.ids !== undefined) {
    copy.ids = filter.ids.slice();
  }
  if (filter.issuers !== undefined) {
    copy.issuers = filter.issuers.slice();
  }
  if (filter.kinds !== undefined) {
    copy.kinds = filter.kinds.slice();
  }
  if (filter.tags !== undefined) {
    const tags: TagConstraint[] = [];
    for (const tag of filter.tags) {
      tags.push({ name: tag.name, values: tag.values.slice() });
    }
    copy.tags = tags;
  }
  if (filter.since !== undefined) {
    copy.since = filter.since;
  }
  if (filter.until !== undefined) {
    copy.until = filter.until;
  }
  if (filter.limit !== undefined) {
    copy.limit = filter.limit;
  }
  return copy;
}
