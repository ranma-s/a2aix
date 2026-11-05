import { describe, expect, it } from "vitest";
import { redactFreeText } from "../src/index.js";

describe("contact redaction in human-facing text", () => {
  it("redacts contact details in free text and leaves ordinary words in place", () => {
    expect(redactFreeText("連絡先は tanaka@example.com と 090-1234-5678 と +81-90-1234-5678")).toBe(
      "連絡先は [contact-removed] と [contact-removed] と [contact-removed]",
    );
    expect(redactFreeText("09012345678")).toBe("[contact-removed]");
    expect(redactFreeText("+819012345678")).toBe("[contact-removed]");
    expect(redactFreeText("+1 202 555 0142")).toBe("[contact-removed]");
    expect(redactFreeText("ｔａｎａｋａ＠ｅｘａｍｐｌｅ．ｃｏｍ")).toBe("[contact-removed]");
    expect(redactFreeText("tanaka [at] example [dot] com")).toBe("[contact-removed]");
    expect(redactFreeText("tanaka(at)example(dot)com")).toBe("[contact-removed]");
    expect(redactFreeText(`\u202Emoc.elpmaxe@akanat`)).toBe("[contact-removed]");
    expect(redactFreeText("tanaka@ex\u200Bample.com").includes("tanaka")).toBe(false);
    expect(redactFreeText("tanaka@ex\u200Bample.com").includes("ample")).toBe(false);
    expect(redactFreeText("金額\u200Bは180000円")).toBe("金額は180000円");
    expect(redactFreeText("金額は180000円。期限は2026-11-20です。")).toBe("金額は180000円。期限は2026-11-20です。");
  });

  it("redacts spaced, dotted, parenthesized, and encoded contacts", () => {
    expect(redactFreeText("090 1234 5678")).toBe("[contact-removed]");
    expect(redactFreeText("090.1234.5678")).toBe("[contact-removed]");
    expect(redactFreeText("(03) 1234-5678")).toBe("[contact-removed]");
    expect(redactFreeText("+81 (90) 1234-5678")).toBe("[contact-removed]");
    expect(redactFreeText("foo&#64;example.com")).toBe("[contact-removed]");
    expect(redactFreeText("foo&#x40;example.com")).toBe("[contact-removed]");
    expect(redactFreeText("foo [at] example [dot] com")).toBe("[contact-removed]");
  });

  it("redacts unicode dashes, middle dots, tight parentheses, and loose entities", () => {
    expect(redactFreeText("090‐1234‐5678")).toBe("[contact-removed]");
    expect(redactFreeText("090–1234–5678")).toBe("[contact-removed]");
    expect(redactFreeText("090−1234−5678")).toBe("[contact-removed]");
    expect(redactFreeText("090ー1234ー5678")).toBe("[contact-removed]");
    expect(redactFreeText("090・1234・5678")).toBe("[contact-removed]");
    expect(redactFreeText("090･1234･5678")).toBe("[contact-removed]");
    expect(redactFreeText("(090)12345678")).toBe("[contact-removed]");
    expect(redactFreeText("（090）12345678")).toBe("[contact-removed]");
    expect(redactFreeText("foo&#x40example.com")).toBe("[contact-removed]");
    expect(redactFreeText("foo&#64example.com")).toBe("[contact-removed]");
    expect(redactFreeText("foo&amp;#64;example.com")).toBe("[contact-removed]");
    expect(redactFreeText("foo&amp;amp;#x40;example.com")).toBe("[contact-removed]");
    expect(redactFreeText("foo&commat;example.com")).toBe("[contact-removed]");
    expect(redactFreeText("foo﹫example.com")).toBe("[contact-removed]");
    expect(redactFreeText("電話は 090‐1234‐5678 まで")).toBe("電話は [contact-removed] まで");
  });

  it("keeps entities that are not an at sign and text that only looks close", () => {
    expect(redactFreeText("&#640;")).toBe("&#640;");
    expect(redactFreeText("&#x400;")).toBe("&#x400;");
    expect(redactFreeText("(1)200000")).toBe("(1)200000");
    expect(redactFreeText("2026ー11ー20")).toBe("2026ー11ー20");
    expect(redactFreeText("デザイン・コーディング")).toBe("デザイン・コーディング");
    expect(redactFreeText("金額は180000円。期限は2026-11-20です。")).toBe("金額は180000円。期限は2026-11-20です。");
  });

  it("keeps dates, postal codes, times, and part numbers that start with zero", () => {
    expect(redactFreeText("納期は2026-01-05です")).toBe("納期は2026-01-05です");
    expect(redactFreeText("2026.01.05まで")).toBe("2026.01.05まで");
    expect(redactFreeText("2026ー01ー05")).toBe("2026ー01ー05");
    expect(redactFreeText("〒060-0001 札幌")).toBe("〒060-0001 札幌");
    expect(redactFreeText("作業時間 09.00-18.00")).toBe("作業時間 09.00-18.00");
    expect(redactFreeText("型番 SKU-0123-45")).toBe("型番 SKU-0123-45");
    expect(redactFreeText("01-02-03 のロット番号")).toBe("01-02-03 のロット番号");
    expect(redactFreeText("初稿は2026-01-05、修正版は2026.02.10までに提出")).toBe(
      "初稿は2026-01-05、修正版は2026.02.10までに提出",
    );
    expect(redactFreeText("2026-01-05 03-1234-5678")).toBe("2026-01-05 [contact-removed]");
  });

  it("redacts parenthesized area codes, spaced or slashed separators, and encoded dots", () => {
    expect(redactFreeText("連絡は03(1234)5678まで")).toBe("連絡は[contact-removed]まで");
    expect(redactFreeText("090(1234)5678")).toBe("[contact-removed]");
    expect(redactFreeText("(090)-1234-5678")).toBe("[contact-removed]");
    expect(redactFreeText("090 - 1234 - 5678")).toBe("[contact-removed]");
    expect(redactFreeText("090 ー 1234 ー 5678")).toBe("[contact-removed]");
    expect(redactFreeText("090/1234/5678")).toBe("[contact-removed]");
    expect(redactFreeText("090〜1234〜5678")).toBe("[contact-removed]");
    expect(redactFreeText("090~1234~5678")).toBe("[contact-removed]");
    expect(redactFreeText("TEL09012345678")).toBe("TEL[contact-removed]");
    expect(redactFreeText("taro&#x40;example&#46;com")).toBe("[contact-removed]");
    expect(redactFreeText("taro@example&#x2e;com")).toBe("[contact-removed]");
    expect(redactFreeText("taro%40example.com")).toBe("[contact-removed]");
  });

  it("redacts a phone behind a short prefix and keeps spaced date and time ranges", () => {
    expect(redactFreeText("電話1-090-1234-5678")).toBe("電話[contact-removed]");
    expect(redactFreeText("連絡は 1-090-1234-5678 まで")).toBe("連絡は [contact-removed] まで");
    expect(redactFreeText("12-090-1234-5678")).toBe("[contact-removed]");
    expect(redactFreeText("期間 01/05/2026 - 03/31/2026")).toBe("期間 01/05/2026 - 03/31/2026");
    expect(redactFreeText("09.00-18.00 / 10.00-19.00")).toBe("09.00-18.00 / 10.00-19.00");
    expect(redactFreeText("03-1234-5678 / 090-1234-5678")).toBe("[contact-removed] / [contact-removed]");
    expect(redactFreeText("01-02-03 のロット番号")).toBe("01-02-03 のロット番号");
    expect(redactFreeText("090-1234-5678-1")).toBe("[contact-removed]-1");
    expect(redactFreeText("090.1234.5678.9")).toBe("[contact-removed].9");
    expect(redactFreeText("090-1234-5678/2026")).toBe("[contact-removed]/2026");
    expect(redactFreeText("1-090-1234-5678-1")).toBe("[contact-removed]-1");
    expect(redactFreeText("期間 2026/01/05 - 2026/03/31")).toBe("期間 2026/01/05 - 2026/03/31");
  });

  it("leaves prices, dates, and budget numbers in place", () => {
    expect(redactFreeText("200000")).toBe("200000");
    expect(redactFreeText("150000")).toBe("150000");
    expect(redactFreeText("180000")).toBe("180000");
    expect(redactFreeText("2026-11-20")).toBe("2026-11-20");
    expect(redactFreeText("2026-12-10T00:00:00.000Z")).toBe("2026-12-10T00:00:00.000Z");
    expect(redactFreeText("予算の下限は150000、上限は180000、その外は200000。期限は2026-11-20です。")).toBe(
      "予算の下限は150000、上限は180000、その外は200000。期限は2026-11-20です。",
    );
  });
});
