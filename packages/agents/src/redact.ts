const hiddenCodePoints = new Set<number>([
  0x200b,
  0x200c,
  0x200d,
  0x2060,
  0xfeff,
  0x202a,
  0x202b,
  0x202c,
  0x202d,
  0x202e,
  0x2066,
  0x2067,
  0x2068,
  0x2069,
]);

const reverseOpeners = new Set<number>([0x202b, 0x202e]);
const reverseClosers = new Set<number>([0x202a, 0x202c, 0x202d]);

type Mark = {
  readonly visual: string;
  readonly origin: number;
  readonly width: number;
};

type Span = {
  start: number;
  end: number;
};

export function redactFreeText(value: string): string {
  const marks = visualMarks(value);
  let visual = "";
  for (const mark of marks) {
    visual += mark.visual;
  }
  const spans = contactSpans(visual, marks);
  let output = value;
  for (let index = spans.length - 1; index >= 0; index -= 1) {
    const span = spans[index];
    if (span === undefined) {
      continue;
    }
    output = `${output.slice(0, span.start)}[contact-removed]${output.slice(span.end)}`;
  }
  return stripHidden(output);
}

function visualMarks(value: string): readonly Mark[] {
  const marks: Mark[] = [];
  let segment: Mark[] = [];
  let reversing = false;
  let index = 0;
  const flush = (): void => {
    if (reversing) {
      for (let cursor = segment.length - 1; cursor >= 0; cursor -= 1) {
        const mark = segment[cursor];
        if (mark !== undefined) {
          marks.push(mark);
        }
      }
    } else {
      for (const mark of segment) {
        marks.push(mark);
      }
    }
    segment = [];
  };
  while (index < value.length) {
    const code = value.codePointAt(index);
    if (code === undefined) {
      break;
    }
    const width = code > 0xffff ? 2 : 1;
    const entity = encodedMark(value, index);
    if (entity !== undefined) {
      segment.push({ visual: entity.visual, origin: index, width: entity.width });
      index += entity.width;
      continue;
    }
    if (reverseOpeners.has(code)) {
      flush();
      reversing = true;
      index += width;
      continue;
    }
    if (reverseClosers.has(code)) {
      flush();
      reversing = false;
      index += width;
      continue;
    }
    if (hiddenCodePoints.has(code)) {
      index += width;
      continue;
    }
    segment.push({ visual: foldChar(code), origin: index, width });
    index += width;
  }
  flush();
  return marks;
}

const encodedMarks: readonly { readonly pattern: RegExp; readonly visual: string }[] = [
  { pattern: /^&(?:amp;)*(?:#(?:0*64(?![0-9]+;)|x0*40(?![0-9a-f]+;))|commat);?/i, visual: "@" },
  { pattern: /^&(?:amp;)*(?:#(?:0*46(?![0-9]+;)|x0*2e(?![0-9a-f]+;))|period);?/i, visual: "." },
  { pattern: /^%40/i, visual: "@" },
  { pattern: /^%2e/i, visual: "." },
];

function encodedMark(value: string, index: number): { readonly visual: string; readonly width: number } | undefined {
  const char = value[index];
  if (char !== "&" && char !== "%") {
    return undefined;
  }
  const rest = value.slice(index, index + 32);
  for (const entry of encodedMarks) {
    const match = entry.pattern.exec(rest);
    if (match !== null) {
      return { visual: entry.visual, width: match[0].length };
    }
  }
  return undefined;
}

function contactSpans(visual: string, marks: readonly Mark[]): readonly Span[] {
  const found: Span[] = [];
  const patterns = [
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
    /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\]|\bat\b)\s*[a-z0-9-]+(?:\s*(?:\.|\(dot\)|\[dot\]|\bdot\b)\s*[a-z0-9-]+)+/gi,
    /\+\d{1,3}(?:[\s().-]*\d){6,14}/g,
  ];
  for (const span of phoneSpans(visual)) {
    pushSpan(found, marks, span.start, span.end);
  }
  for (const pattern of patterns) {
    for (const match of visual.matchAll(pattern)) {
      if (match[0].length > 0) {
        pushSpan(found, marks, match.index, match.index + match[0].length);
      }
    }
  }
  return mergeSpans(found);
}

function pushSpan(found: Span[], marks: readonly Mark[], from: number, to: number): void {
  const startMark = marks[from];
  const endMark = marks[to - 1];
  if (startMark === undefined || endMark === undefined) {
    return;
  }
  const start = Math.min(startMark.origin, endMark.origin);
  const last = startMark.origin <= endMark.origin ? endMark : startMark;
  found.push({ start, end: last.origin + last.width });
}

const phoneSeparators = new Set([" ", ".", "-", "/", "~"]);
const phoneDigitCounts = new Set([10, 11]);
const phoneMaxGroups = 5;
const phoneMaxGap = 3;

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}

function shortPrefixStart(visual: string, index: number): number | undefined {
  const separator = visual[index - 1];
  if (separator === undefined || separator === " " || !phoneSeparators.has(separator)) {
    return undefined;
  }
  let start = index - 1;
  while (isDigit(visual[start - 1])) {
    start -= 1;
  }
  const length = index - 1 - start;
  if (length < 1 || length > 3) {
    return undefined;
  }
  const before = visual[start - 1];
  if (isDigit(before) || (before !== undefined && phoneSeparators.has(before) && before !== " ")) {
    return undefined;
  }
  return start;
}

function phoneMayStart(visual: string, index: number): boolean {
  const previous = visual[index - 1];
  if (isDigit(previous)) {
    return false;
  }
  if (
    previous !== undefined &&
    previous !== " " &&
    phoneSeparators.has(previous) &&
    isDigit(visual[index - 2]) &&
    shortPrefixStart(visual, index) === undefined
  ) {
    return false;
  }
  const char = visual[index];
  if (char === "0") {
    return true;
  }
  return char === "(" && isDigit(visual[index + 1]);
}

function continuesNumber(visual: string, end: number): boolean {
  const next = visual[end];
  return next !== undefined && next !== " " && phoneSeparators.has(next) && isDigit(visual[end + 1]);
}

function phoneSpans(visual: string): readonly Span[] {
  const spans: Span[] = [];
  let index = 0;
  while (index < visual.length) {
    const end = phoneMayStart(visual, index) ? phoneEnd(visual, index) : undefined;
    if (end === undefined) {
      index += 1;
      continue;
    }
    spans.push({ start: shortPrefixStart(visual, index) ?? index, end });
    index = end;
  }
  return spans;
}

function phoneEnd(visual: string, start: number): number | undefined {
  const leadingParen = visual[start] === "(";
  if (leadingParen && visual[start + 1] !== "0") {
    const close = visual.indexOf(")", start);
    if (close < 0 || close - start > 5) {
      return undefined;
    }
  }
  let cursor = start;
  let digits = 0;
  let groups = 0;
  let open = false;
  let best: number | undefined;
  while (cursor < visual.length && groups < phoneMaxGroups) {
    let gap = 0;
    while (cursor < visual.length && gap <= phoneMaxGap) {
      const char = visual[cursor];
      if (char === "(" && !open) {
        open = true;
      } else if (char === undefined || !phoneSeparators.has(char)) {
        break;
      }
      cursor += 1;
      gap += 1;
    }
    if (gap > phoneMaxGap || !isDigit(visual[cursor])) {
      break;
    }
    if (groups === 0 && !leadingParen && visual[cursor] !== "0") {
      break;
    }
    const groupStart = cursor;
    while (isDigit(visual[cursor])) {
      cursor += 1;
    }
    const groupLength = cursor - groupStart;
    if (groupLength > 11) {
      break;
    }
    digits += groupLength;
    groups += 1;
    if (open && visual[cursor] === ")") {
      open = false;
      cursor += 1;
    }
    if (digits > 11) {
      break;
    }
    if (!open && phoneDigitCounts.has(digits) && !continuesNumber(visual, cursor)) {
      best = cursor;
    }
  }
  return best;
}

function mergeSpans(spans: readonly Span[]): readonly Span[] {
  const ordered = spans.slice().sort((left, right) => left.start - right.start);
  const merged: Span[] = [];
  for (const span of ordered) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && span.start <= previous.end) {
      previous.end = Math.max(previous.end, span.end);
      continue;
    }
    merged.push({ start: span.start, end: span.end });
  }
  return merged;
}

function stripHidden(value: string): string {
  let output = "";
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === undefined || hiddenCodePoints.has(code)) {
      continue;
    }
    output += char;
  }
  return output;
}

const foldedCodePoints = new Map<number, string>([
  [0x2010, "-"],
  [0x2011, "-"],
  [0x2012, "-"],
  [0x2013, "-"],
  [0x2014, "-"],
  [0x2015, "-"],
  [0x2212, "-"],
  [0x30fc, "-"],
  [0xff70, "-"],
  [0xfe63, "-"],
  [0x30fb, "."],
  [0xff65, "."],
  [0xfe6b, "@"],
  [0x3000, " "],
  [0x301c, "~"],
]);

function foldChar(code: number): string {
  const folded = foldedCodePoints.get(code);
  if (folded !== undefined) {
    return folded;
  }
  if (code >= 0xff01 && code <= 0xff5e) {
    return String.fromCodePoint(code - 0xff00 + 0x20);
  }
  return String.fromCodePoint(code);
}
