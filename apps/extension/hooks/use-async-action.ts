import { useCallback, useState } from "react";

// The async lifecycle shared by every user-triggered action in the popup and
// options pages: flip a `pending` flag, run the action, route a failure to a
// caller-supplied handler, and always clear `pending`. Owning the try/finally
// here is what keeps `pending` honest — a thrown action can never strand a
// disabled UI. Success and error MESSAGING stay with each caller's reducer,
// since those differ per page; only the lifecycle is shared.
export function useAsyncAction(): {
  pending: boolean;
  run: (action: () => Promise<void>, onError: (error: unknown) => void) => Promise<void>;
} {
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (action: () => Promise<void>, onError: (error: unknown) => void) => {
      setPending(true);

      try {
        await action();
      } catch (error) {
        onError(error);
      } finally {
        setPending(false);
      }
    },
    [],
  );

  return { pending, run };
}
