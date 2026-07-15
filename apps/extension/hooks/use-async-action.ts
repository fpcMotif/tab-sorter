import { useCallback, useState } from "react";

// The async lifecycle shared by every user-triggered action in the popup and
// options pages: flip a `pending` flag, run the action, route a failure to a
// caller-supplied handler, and always clear `pending`. Owning the try/finally
// here is what keeps `pending` honest — a thrown action can never strand a
// disabled UI. Success and error MESSAGING stay with each caller's reducer,
// since those differ per page; only the lifecycle is shared.
//
// `pendingKey` names the in-flight action so a single control can show its own
// spinner (`pendingKey === "tidy"`) while the rest of the UI reads the shared
// `pending`. A keyless run stores "" so `pending` still flips;
// `pending === (pendingKey !== null)`.
export function useAsyncAction(): {
  pending: boolean;
  pendingKey: string | null;
  run: (
    action: () => Promise<void>,
    onError: (error: unknown) => void,
    key?: string,
  ) => Promise<void>;
} {
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const run = useCallback(
    async (action: () => Promise<void>, onError: (error: unknown) => void, key = "") => {
      setPendingKey(key);

      try {
        await action();
      } catch (error) {
        onError(error);
      } finally {
        setPendingKey(null);
      }
    },
    [],
  );

  return { pending: pendingKey !== null, pendingKey, run };
}
