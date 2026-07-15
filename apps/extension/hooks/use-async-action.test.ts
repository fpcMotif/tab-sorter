import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useAsyncAction } from "./use-async-action";

// A promise whose settlement the test controls, so the in-flight `pending`
// window can be observed before the action resolves.
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("useAsyncAction", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useAsyncAction());

    expect(result.current.pending).toBe(false);
    expect(result.current.pendingKey).toBeNull();
  });

  it("flips pending while a keyless action runs and clears it on success", async () => {
    const { result } = renderHook(() => useAsyncAction());
    const gate = deferred();

    let running!: Promise<void>;
    act(() => {
      running = result.current.run(() => gate.promise, vi.fn());
    });

    expect(result.current.pending).toBe(true);
    expect(result.current.pendingKey).toBe("");

    await act(async () => {
      gate.resolve();
      await running;
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.pendingKey).toBeNull();
  });

  it("surfaces the key while a keyed action runs", async () => {
    const { result } = renderHook(() => useAsyncAction());
    const gate = deferred();

    let running!: Promise<void>;
    act(() => {
      running = result.current.run(() => gate.promise, vi.fn(), "tidy");
    });

    expect(result.current.pendingKey).toBe("tidy");
    expect(result.current.pending).toBe(true);

    await act(async () => {
      gate.resolve();
      await running;
    });

    expect(result.current.pendingKey).toBeNull();
  });

  it("routes a thrown action to onError and still clears pending", async () => {
    const { result } = renderHook(() => useAsyncAction());
    const onError = vi.fn();
    const boom = new Error("boom");

    await act(async () => {
      await result.current.run(() => Promise.reject(boom), onError, "extract");
    });

    expect(onError).toHaveBeenCalledWith(boom);
    expect(result.current.pending).toBe(false);
    expect(result.current.pendingKey).toBeNull();
  });
});
