import { describe, expect, it } from "vitest";

import {
  isProtocolErrorCode,
  PROTOCOL_ERROR_CODES,
  protocolError,
  type ProtocolErrorCode,
} from "../protocol-error";

describe("PROTOCOL_ERROR_CODES", () => {
  it("pins the exact error-code vocabulary", () => {
    expect(PROTOCOL_ERROR_CODES).toEqual([
      "INTERNAL_ERROR",
      "INVALID_REQUEST",
      "MUTATION_FAILED",
      "RECOVERY_AMBIGUOUS",
      "RECOVERY_REQUIRED",
    ]);
  });

  it("has no duplicate codes", () => {
    expect(new Set(PROTOCOL_ERROR_CODES).size).toBe(PROTOCOL_ERROR_CODES.length);
  });
});

describe("isProtocolErrorCode", () => {
  it("accepts every declared code", () => {
    for (const code of PROTOCOL_ERROR_CODES) {
      expect(isProtocolErrorCode(code)).toBe(true);
    }
  });

  it("rejects a string that is not a declared code", () => {
    expect(isProtocolErrorCode("NOT_A_CODE")).toBe(false);
  });

  it("rejects a lowercase variant of a real code (case-sensitive)", () => {
    expect(isProtocolErrorCode("internal_error")).toBe(false);
  });

  it("rejects a code with surrounding whitespace", () => {
    expect(isProtocolErrorCode("INTERNAL_ERROR ")).toBe(false);
  });

  it("rejects the empty string", () => {
    expect(isProtocolErrorCode("")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isProtocolErrorCode(undefined)).toBe(false);
    expect(isProtocolErrorCode(null)).toBe(false);
    expect(isProtocolErrorCode(0)).toBe(false);
    expect(isProtocolErrorCode({})).toBe(false);
    expect(isProtocolErrorCode(["INTERNAL_ERROR"])).toBe(false);
  });

  // Narrows `unknown` to ProtocolErrorCode for callers — assert the guard
  // actually type-narrows, not just that it returns true at runtime.
  it("narrows to ProtocolErrorCode when true", () => {
    const value: unknown = "MUTATION_FAILED";
    if (isProtocolErrorCode(value)) {
      const narrowed: ProtocolErrorCode = value;
      expect(narrowed).toBe("MUTATION_FAILED");
    } else {
      throw new Error("expected value to be recognized as a protocol error code");
    }
  });
});

describe("protocolError", () => {
  it("builds a real Error carrying the given message", () => {
    const error = protocolError("INVALID_REQUEST", "bad request");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("bad request");
  });

  it("attaches the given code to the error", () => {
    const error = protocolError("RECOVERY_REQUIRED", "recover me");
    expect(error.code).toBe("RECOVERY_REQUIRED");
  });

  it("tags the constructed error as a recognized protocol error code", () => {
    const error = protocolError("RECOVERY_AMBIGUOUS", "ambiguous");
    expect(isProtocolErrorCode(error.code)).toBe(true);
  });

  it("produces an independent error per call, not a shared instance", () => {
    const first = protocolError("INTERNAL_ERROR", "one");
    const second = protocolError("INTERNAL_ERROR", "two");
    expect(first).not.toBe(second);
    expect(first.message).toBe("one");
    expect(second.message).toBe("two");
  });
});
