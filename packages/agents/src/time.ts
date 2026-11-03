import { parseInstant } from "@ix/distribution";

const rfc3339Pattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;

export function isRfc3339(value: string): boolean {
  const match = rfc3339Pattern.exec(value);
  if (match === null) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offset = match[8];
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offset === undefined ||
    !offsetOk(offset)
  ) {
    return false;
  }
  return parseInstant(value) !== undefined;
}

function offsetOk(offset: string): boolean {
  if (offset === "Z") {
    return true;
  }
  if (offset.length !== 6) {
    return false;
  }
  const sign = offset[0];
  const hour = Number(offset.slice(1, 3));
  const minute = Number(offset.slice(4, 6));
  return (sign === "+" || sign === "-") && hour <= 23 && minute <= 59;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }
  return 31;
}
