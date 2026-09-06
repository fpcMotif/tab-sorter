import { afterEach, describe, expect, it, vi } from "vitest";
import type { Browser } from "wxt/browser";

import {
  createBackgroundClient,
  createBackgroundDispatcher,
  createBackgroundListener,
  requestMutation,
  requestPrefsPatch,
  type BackgroundRequest,
} from "./runtime";
import { DEFAULT_PREFS } from "@tab-sorter/core/types";

const request = {
  v: 1,
  requestId: "req-1",
  type: "prefs.patch",
  patch: { ignorePinned: false },
} as const;

const sender = {} as Browser.runtime.MessageSender;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createBackgroundListener", () => {
  it("keeps an owned async request open and responds with its result", async () => {
    const result = { ignorePinned: false };
    let resolve!: (value: typeof result) => void;
    const handle = vi.fn(
      () =>
        new Promise<typeof result>((done) => {
          resolve = done;
        }),
    );
    const sendResponse = vi.fn();
    const listener = createBackgroundListener(handle);

    expect(listener(request, sender, sendResponse)).toBe(true);
    expect(sendResponse).not.toHaveBeenCalled();

    resolve(result);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledOnce();
      expect(sendResponse).toHaveBeenCalledWith({
        v: 1,
        requestId: request.requestId,
        ok: true,
        result,
      });
    });
  });

  it.each([
    { ...request, v: 2 },
    { ...request, requestId: "" },
    { v: 1, type: "prefs.patch", patch: {} },
    [],
  ])("ignores unowned requests", (unknownRequest) => {
    const handle = vi.fn();
    const sendResponse = vi.fn();
    const listener = createBackgroundListener(handle);

    expect(listener(unknownRequest, sender, sendResponse)).toBeUndefined();
    expect(handle).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it.each([
    { ...request, type: "unknown" },
    { v: 1, requestId: "req-1", type: "prefs.patch" },
    { ...request, extra: true },
    { v: 1, requestId: "req-1", type: "prefs.patch", intent: {} },
    { v: 1, requestId: "req-1", type: "mutation.execute", patch: {} },
  ])("rejects a malformed owned request", (invalidRequest) => {
    const handle = vi.fn();
    const sendResponse = vi.fn();
    const listener = createBackgroundListener(handle);

    expect(listener(invalidRequest, sender, sendResponse)).toBe(true);
    expect(handle).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledExactlyOnceWith({
      v: 1,
      requestId: "req-1",
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "invalid background request",
      },
    });
  });

  it("turns a handler failure into an error reply", async () => {
    const cause = Object.assign(new Error("recover first"), { code: "RECOVERY_REQUIRED" });
    const handle = vi.fn().mockRejectedValue(cause);
    const sendResponse = vi.fn();
    const listener = createBackgroundListener(handle);

    expect(listener(request, sender, sendResponse)).toBe(true);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledOnce();
      expect(sendResponse).toHaveBeenCalledWith({
        v: 1,
        requestId: request.requestId,
        ok: false,
        error: {
          code: "RECOVERY_REQUIRED",
          message: "recover first",
        },
      });
    });
  });

  it("turns a synchronous throw into an error reply", () => {
    const handle = vi.fn(() => {
      throw new Error("boom");
    });
    const sendResponse = vi.fn();
    const listener = createBackgroundListener(handle);

    expect(listener(request, sender, sendResponse)).toBe(true);
    expect(sendResponse).toHaveBeenCalledExactlyOnceWith({
      v: 1,
      requestId: request.requestId,
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "boom",
      },
    });
  });

  it("does not expose undeclared handler error codes", async () => {
    const cause = Object.assign(new Error("private browser failure"), { code: "E_BROWSER" });
    const handle = vi.fn().mockRejectedValue(cause);
    const sendResponse = vi.fn();
    const listener = createBackgroundListener(handle);

    expect(listener(request, sender, sendResponse)).toBe(true);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledExactlyOnceWith({
        v: 1,
        requestId: request.requestId,
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "private browser failure",
        },
      });
    });
  });

  it("hides non-Error rejection details", async () => {
    const handle = vi.fn().mockRejectedValue("private failure");
    const sendResponse = vi.fn();
    const listener = createBackgroundListener(handle);

    expect(listener(request, sender, sendResponse)).toBe(true);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledExactlyOnceWith({
        v: 1,
        requestId: request.requestId,
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Background request failed.",
        },
      });
    });
  });
});

describe("createBackgroundClient", () => {
  it("returns a matching success result", async () => {
    const result = { ignorePinned: false };
    const send = vi.fn().mockResolvedValue({
      v: 1,
      requestId: request.requestId,
      ok: true,
      result,
    });
    const client = createBackgroundClient(send);

    await expect(client(request)).resolves.toEqual(result);
  });

  it("throws a background error with its stable code", async () => {
    const send = vi.fn().mockResolvedValue({
      v: 1,
      requestId: request.requestId,
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "bad patch",
      },
    });
    const client = createBackgroundClient(send);

    await expect(client(request)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      message: "bad patch",
    });
  });

  it.each([
    ["malformed", null],
    [
      "for another request",
      { v: 1, requestId: "req-other", ok: true, result: { ignorePinned: false } },
    ],
    [
      "with extra fields",
      {
        v: 1,
        requestId: request.requestId,
        ok: true,
        result: { ignorePinned: false },
        extra: true,
      },
    ],
    [
      "with the wrong payload field",
      {
        v: 1,
        requestId: request.requestId,
        ok: true,
        error: { code: "INTERNAL_ERROR", message: "wrong" },
      },
    ],
    [
      "with an undeclared error code",
      {
        v: 1,
        requestId: request.requestId,
        ok: false,
        error: { code: "E_BROWSER", message: "wrong" },
      },
    ],
  ])("rejects a %s response", async (_label, response) => {
    const send = vi.fn().mockResolvedValue(response);
    const client = createBackgroundClient(send);

    await expect(client(request)).rejects.toThrow();
    expect(send).toHaveBeenCalledExactlyOnceWith(request);
  });
});

describe("runtime clients", () => {
  it("sends typed requests with unique request IDs", async () => {
    const sortResult = { type: "sort", changed: false, moved: 0 } as const;
    const prefs = { ...DEFAULT_PREFS, ignorePinned: false };
    const sendMessage = vi.fn(async (outgoing: BackgroundRequest) => ({
      v: 1,
      requestId: outgoing.requestId,
      ok: true,
      result: outgoing.type === "mutation.execute" ? sortResult : prefs,
    }));
    vi.stubGlobal("browser", { runtime: { sendMessage } });

    await expect(requestMutation({ type: "sort", windowId: 7, mode: "domain" })).resolves.toEqual(
      sortResult,
    );
    await expect(requestPrefsPatch({ ignorePinned: false })).resolves.toEqual(prefs);

    const mutationRequest = sendMessage.mock.calls[0]?.[0];
    const prefsRequest = sendMessage.mock.calls[1]?.[0];
    expect(mutationRequest).toMatchObject({
      v: 1,
      type: "mutation.execute",
      intent: { type: "sort", windowId: 7, mode: "domain" },
    });
    expect(prefsRequest).toMatchObject({
      v: 1,
      type: "prefs.patch",
      patch: { ignorePinned: false },
    });
    expect(mutationRequest?.requestId).not.toBe(prefsRequest?.requestId);
  });
});

describe("createBackgroundDispatcher", () => {
  it("routes mutation intents to the sole mutation executor", async () => {
    const intent = { type: "tidy", windowId: 7 };
    const result = { type: "tidy", changed: true };
    const executeMutation = vi.fn().mockResolvedValue(result);
    const commitPrefsPatch = vi.fn();
    const dispatch = createBackgroundDispatcher({ executeMutation, commitPrefsPatch });

    await expect(
      dispatch(
        {
          v: 1,
          requestId: "req-mutation",
          type: "mutation.execute",
          intent,
        },
        sender,
      ),
    ).resolves.toEqual(result);
    expect(executeMutation).toHaveBeenCalledExactlyOnceWith(intent);
    expect(commitPrefsPatch).not.toHaveBeenCalled();
  });

  it("routes prefs patches to the sole prefs writer", async () => {
    const patch = { ignorePinned: false };
    const prefs = { ignorePinned: false, defaultSort: "title" };
    const executeMutation = vi.fn();
    const commitPrefsPatch = vi.fn().mockResolvedValue(prefs);
    const dispatch = createBackgroundDispatcher({ executeMutation, commitPrefsPatch });

    await expect(
      dispatch(
        {
          v: 1,
          requestId: "req-prefs",
          type: "prefs.patch",
          patch,
        },
        sender,
      ),
    ).resolves.toEqual(prefs);
    expect(commitPrefsPatch).toHaveBeenCalledExactlyOnceWith(patch);
    expect(executeMutation).not.toHaveBeenCalled();
  });
});
