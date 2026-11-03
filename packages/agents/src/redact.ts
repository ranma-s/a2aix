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
    const entity = atEntityWidth(value, index);
    if (entity > 0) {
      segment.push({ visual: "@", origin: index, width: entity });
      index += entity;
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

function atEntityWidth(value: string, index: number): number {
  const match = /^&(?:amp;)*(?:#(?:0*64(?![0-9]+;)|x0*40(?![0-9a-f]+;))|commat);?/i.exec(value.slice(index));
  if (match === null) {
    return 0;
  }
  return match[0].length;
}

function contactSpans(visual: string, marks: readonly Mark[]): readonly Span[] {
  const found: Span[] = [];
  const patterns = [
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
    /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\]|\bat\b)\s*[a-z0-9-]+(?:\s*(?:\.|\(dot\)|\[dot\]|\bdot\b)\s*[a-z0-9-]+)+/gi,
    /\+\d{1,3}(?:[\s().-]*\d){6,14}/g,
    /\(\d{1,4}\)\s*\d{1,4}(?:[ .-]\d{2,4})+/g,
    /\(0\d{1,4}\)\s*\d{6,8}(?![0-9])/g,
    /\b0\d{1,4}(?:[ .-]\d{1,4}){1,3}\b/g,
    /\b0\d{9,10}\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of visual.matchAll(pattern)) {
      const from = match.index;
      const text = match[0];
      if (text.length === 0) {
        continue;
      }
      const startMark = marks[from];
      const endMark = marks[from + text.length - 1];
      if (startMark === undefined || endMark === undefined) {
        continue;
      }
      const start = Math.min(startMark.origin, endMark.origin);
      const last = startMark.origin <= endMark.origin ? endMark : startMark;
      found.push({ start, end: last.origin + last.width });
    }
  }
  return mergeSpans(found);
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
