import type { Money } from "@ix/a2a-ext-negotiation";
import type { VerifyMessage } from "./schema.js";

export type VerifyBounds = {
  readonly posterMax: Money;
  readonly workerMin: Money;
  readonly workerMaxHoursPerWeek: number;
  readonly excludedWork: readonly string[];
};

export type BoundResult = { readonly ok: true } | { readonly ok: false; readonly detail: string };

export function checkBounds(messages: readonly VerifyMessage[], bounds: VerifyBounds): BoundResult {
  if (!Number.isSafeInteger(bounds.workerMaxHoursPerWeek) || bounds.workerMaxHoursPerWeek < 0) {
    return { ok: false, detail: "the hour cap is not an integer" };
  }
  for (const message of messages) {
    const checked = checkOne(message, bounds);
    if (!checked.ok) {
      return checked;
    }
  }
  return { ok: true };
}

function checkOne(message: VerifyMessage, bounds: VerifyBounds): BoundResult {
  switch (message.type) {
    case "Proposal": {
      const priced = checkPrice(message.price, bounds);
      if (!priced.ok) {
        return priced;
      }
      const scoped = checkScope(message.scope, bounds);
      if (!scoped.ok) {
        return scoped;
      }
      if (message.availability.hoursPerWeek > bounds.workerMaxHoursPerWeek) {
        return { ok: false, detail: "the hours are above the worker maximum" };
      }
      return { ok: true };
    }
    case "AgreementDraft": {
      const priced = checkPrice(message.price, bounds);
      if (!priced.ok) {
        return priced;
      }
      return checkScope(message.scope, bounds);
    }
    case "CounterProposal":
    case "ApprovalDecision":
      return { ok: true };
  }
}

function checkPrice(price: Money, bounds: VerifyBounds): BoundResult {
  if (!sameBasis(price, bounds.posterMax) || price.amount > bounds.posterMax.amount) {
    return { ok: false, detail: "the amount is above the poster maximum" };
  }
  if (!sameBasis(price, bounds.workerMin) || price.amount < bounds.workerMin.amount) {
    return { ok: false, detail: "the amount is below the worker minimum" };
  }
  return { ok: true };
}

function checkScope(scope: string, bounds: VerifyBounds): BoundResult {
  for (const excluded of bounds.excludedWork) {
    if (excluded.length > 0 && scope.includes(excluded)) {
      return { ok: false, detail: "the scope includes excluded work" };
    }
  }
  return { ok: true };
}

function sameBasis(left: Money, right: Money): boolean {
  return left.currency === right.currency && left.taxIncluded === right.taxIncluded;
}
