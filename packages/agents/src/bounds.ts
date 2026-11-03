import type { Money } from "@ix/a2a-ext-negotiation";
import type { PosterBound, WorkerBound } from "./types.js";

export function posterAllows(bound: PosterBound, price: Money): boolean {
  return sameBasis(bound.maxAmount, price) && price.amount <= bound.maxAmount.amount;
}

export function workerAllows(
  bound: WorkerBound,
  price: Money,
  hoursPerWeek: number,
  scope: string,
): boolean {
  if (!sameBasis(bound.minAmount, price) || price.amount < bound.minAmount.amount) {
    return false;
  }
  if (
    !Number.isSafeInteger(hoursPerWeek) ||
    hoursPerWeek < 0 ||
    hoursPerWeek > bound.maxHoursPerWeek
  ) {
    return false;
  }
  for (const excluded of bound.excludedWork) {
    if (excluded.length > 0 && scope.includes(excluded)) {
      return false;
    }
  }
  return true;
}

function sameBasis(left: Money, right: Money): boolean {
  return left.currency === right.currency && left.taxIncluded === right.taxIncluded;
}
