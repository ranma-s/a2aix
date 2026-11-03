import type { EventFilter, RelayEventInput, StoredEvent } from "@ix/distribution";

export type BoardFailure = {
  readonly ok: false;
  readonly reason: string;
  readonly detail: string;
};

export type PublishAnswer = { readonly ok: true; readonly event: StoredEvent } | BoardFailure;

export type QueryAnswer = { readonly ok: true; readonly events: readonly StoredEvent[] } | BoardFailure;

export type SubscribeAnswer =
  | { readonly ok: true; readonly id: string; readonly close: () => void }
  | BoardFailure;

export type JobBoard = {
  readonly publish: (input: RelayEventInput) => PublishAnswer | Promise<PublishAnswer>;
  readonly query: (filter: EventFilter) => QueryAnswer | Promise<QueryAnswer>;
  readonly subscribe: (
    filter: EventFilter,
    listener: (event: StoredEvent) => void,
  ) => SubscribeAnswer | Promise<SubscribeAnswer>;
};
