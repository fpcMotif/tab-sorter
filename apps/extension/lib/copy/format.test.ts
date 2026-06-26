import { describe, expect, it } from "vitest";

import {
  defineFormat,
  getFormat,
  isCustomFormatId,
  isFormatId,
  type Format,
  type FormatId,
} from "@/lib/copy/format.ts";
import type { TabCtx } from "@/lib/copy/types.ts";

describe("defineFormat", () => {
  it("is an identity helper that infers opts type for typed callbacks", () => {
    const spec = defineFormat({
      id: "url" as const,
      label: () => "URL",
      transforms: () => ({ text: { tab: ({ tab }: TabCtx) => tab.url } }),
    });
    // identity: returns exactly what was passed
    expect(spec.id).toBe("url");
    expect(spec.label()).toBe("URL");
  });
});

describe("FormatId guards", () => {
  it("isFormatId accepts builtin ids and custom-* ids", () => {
    expect(isFormatId("url")).toBe(true);
    expect(isFormatId("link")).toBe(true);
    expect(isFormatId("custom-abc123")).toBe(true);
  });

  it("isFormatId rejects unknown ids", () => {
    expect(isFormatId("nope")).toBe(false);
    expect(isFormatId("")).toBe(false);
  });

  it("isCustomFormatId only matches the custom- prefix", () => {
    expect(isCustomFormatId("custom-x")).toBe(true);
    expect(isCustomFormatId("url")).toBe(false);
  });
});

describe("getFormat", () => {
  it("returns the registered builtin format by id", () => {
    const fmt: Format = getFormat("url");
    expect(fmt.id).toBe("url");
    const id: FormatId = "url";
    expect(getFormat(id).label()).toBe("URL");
  });

  it("throws on an unknown id", () => {
    // @ts-expect-error testing runtime guard with an invalid id
    expect(() => getFormat("nope")).toThrow();
  });
});
