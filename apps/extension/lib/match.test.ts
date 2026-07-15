import { describe, expect, it } from "vitest";

import { MATCH_SAFETY_CAP, matchPattern, reasonToString, validatePattern } from "./match";
import type { TabLite } from "./types";

const tabs: TabLite[] = [
  {
    id: 1,
    title: "GitHub issue",
    url: "https://github.com/org/repo/issues/1",
    index: 0,
    pinned: false,
  },
  { id: 2, title: "GitHub PR", url: "https://github.com/org/repo/pull/2", index: 1, pinned: false },
  { id: 3, title: "Docs", url: "https://docs.example.com/guide", index: 2, pinned: false },
  { id: 4, title: "Settings", url: "chrome://settings", index: 3, pinned: false },
];

describe("matchPattern", () => {
  it("matches against title and url", () => {
    expect(matchPattern(tabs, "pull/2")).toEqual({ ok: true, ids: [2] });
    expect(matchPattern(tabs, "docs")).toEqual({ ok: true, ids: [3] });
  });

  it("returns an empty id list when nothing matches", () => {
    expect(matchPattern(tabs, "definitely-missing")).toEqual({ ok: true, ids: [] });
  });

  // The g/y-strip rule, asserted through the public interface: a reused matcher
  // would advance lastIndex and skip tabs — every hit must still be returned.
  it("ignores stateful g/y flags so every match is returned", () => {
    expect(matchPattern(tabs, "github", "gi")).toEqual({ ok: true, ids: [1, 2] });
    expect(matchPattern(tabs, "github", "g")).toEqual({ ok: true, ids: [1, 2] });
  });

  it("returns an invalid-pattern verdict instead of throwing", () => {
    expect(matchPattern(tabs, "[")).toEqual({ ok: false, reason: "pattern" });
  });

  it("refuses a source over the match safety cap", () => {
    expect(matchPattern(tabs, "a".repeat(MATCH_SAFETY_CAP + 1))).toEqual({
      ok: false,
      reason: "tooLong",
    });
  });
});

describe("validatePattern", () => {
  it("accepts a valid pattern and returns a compiled regex", () => {
    const verdict = validatePattern("git.*hub", "i");

    expect(verdict.ok).toBe(true);
    expect(verdict.ok && verdict.regex.test("GitHub")).toBe(true);
  });

  it("strips stateful g/y flags from the compiled regex", () => {
    const gi = validatePattern("x", "gi");
    const y = validatePattern("x", "y");

    expect(gi.ok && gi.regex.flags).toBe("i");
    expect(y.ok && y.regex.flags).toBe("");
  });

  it("blames the pattern when the source is malformed", () => {
    expect(validatePattern("[")).toEqual({ ok: false, reason: "pattern" });
  });

  it("blames the flags when only the flags string is invalid", () => {
    expect(validatePattern("ok", "z")).toEqual({ ok: false, reason: "flags" });
  });

  it("refuses a source at one past the safety cap but accepts the cap itself", () => {
    expect(validatePattern("a".repeat(MATCH_SAFETY_CAP + 1))).toEqual({
      ok: false,
      reason: "tooLong",
    });
    expect(validatePattern("a".repeat(MATCH_SAFETY_CAP)).ok).toBe(true);
  });
});

describe("reasonToString", () => {
  it("maps each reason to a distinct message", () => {
    expect(reasonToString("pattern")).toBe("Invalid regular expression.");
    expect(reasonToString("flags")).toBe("Invalid regex flags.");
    expect(reasonToString("tooLong")).toBe("Pattern is too long.");
  });
});
