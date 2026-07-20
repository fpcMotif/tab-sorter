import type { Browser } from "wxt/browser";

import type { MutationIntent, MutationResult } from "./mutation";
import { isProtocolErrorCode, protocolError, type ProtocolErrorCode } from "./protocol-error";
import type { Prefs } from "@tab-sorter/core/types";

export type BackgroundRequest =
  | {
      v: 1;
      requestId: string;
      type: "mutation.execute";
      intent: unknown;
    }
  | {
      v: 1;
      requestId: string;
      type: "prefs.patch";
      patch: unknown;
    };

interface BackgroundSuccess {
  v: 1;
  requestId: string;
  ok: true;
  result: unknown;
}

interface BackgroundFailure {
  v: 1;
  requestId: string;
  ok: false;
  error: {
    code: ProtocolErrorCode;
    message: string;
  };
}

type BackgroundReply = BackgroundSuccess | BackgroundFailure;
type BackgroundHandler = (
  request: BackgroundRequest,
  sender: Browser.runtime.MessageSender,
) => Promise<unknown> | unknown;
type SendRuntimeMessage = (request: BackgroundRequest) => Promise<unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);

  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function ownedRequestId(value: unknown): string | undefined {
  if (
    !isRecord(value) ||
    value.v !== 1 ||
    typeof value.requestId !== "string" ||
    value.requestId.length === 0
  ) {
    return undefined;
  }

  return value.requestId;
}

function isBackgroundRequest(value: unknown): value is BackgroundRequest {
  if (!isRecord(value) || ownedRequestId(value) === undefined) {
    return false;
  }

  if (value.type === "mutation.execute") {
    return hasExactKeys(value, ["v", "requestId", "type", "intent"]);
  }

  return value.type === "prefs.patch" && hasExactKeys(value, ["v", "requestId", "type", "patch"]);
}

function isBackgroundReply(value: unknown): value is BackgroundReply {
  if (
    !isRecord(value) ||
    value.v !== 1 ||
    typeof value.requestId !== "string" ||
    typeof value.ok !== "boolean"
  ) {
    return false;
  }

  if (value.ok) {
    return hasExactKeys(value, ["v", "requestId", "ok", "result"]);
  }

  return (
    hasExactKeys(value, ["v", "requestId", "ok", "error"]) &&
    isRecord(value.error) &&
    hasExactKeys(value.error, ["code", "message"]) &&
    isProtocolErrorCode(value.error.code) &&
    typeof value.error.message === "string"
  );
}

function errorReply(requestId: string, cause: unknown): BackgroundFailure {
  const code = isRecord(cause) && isProtocolErrorCode(cause.code) ? cause.code : "INTERNAL_ERROR";
  const message = cause instanceof Error ? cause.message : "Background request failed.";

  return { v: 1, requestId, ok: false, error: { code, message } };
}

export function createBackgroundListener(handle: BackgroundHandler) {
  return (
    message: unknown,
    sender: Browser.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ): true | undefined => {
    if (!isBackgroundRequest(message)) {
      const requestId = ownedRequestId(message);
      if (requestId !== undefined) {
        sendResponse(
          errorReply(requestId, protocolError("INVALID_REQUEST", "invalid background request")),
        );
        return true;
      }

      return undefined;
    }

    let handled: Promise<unknown> | unknown;
    try {
      handled = handle(message, sender);
    } catch (cause) {
      sendResponse(errorReply(message.requestId, cause));
      return true;
    }

    void Promise.resolve(handled).then(
      (result) => {
        sendResponse({ v: 1, requestId: message.requestId, ok: true, result });
      },
      (cause: unknown) => {
        sendResponse(errorReply(message.requestId, cause));
      },
    );

    return true;
  };
}

export function createBackgroundClient(send: SendRuntimeMessage) {
  return async <Result>(request: BackgroundRequest): Promise<Result> => {
    const reply = await send(request);

    if (!isBackgroundReply(reply) || reply.requestId !== request.requestId) {
      throw new Error("invalid background response");
    }

    if (!reply.ok) {
      const error = new Error(reply.error.message) as Error & { code: ProtocolErrorCode };
      error.code = reply.error.code;
      throw error;
    }

    return reply.result as Result;
  };
}

interface BackgroundDispatcherDependencies {
  executeMutation: (intent: unknown) => Promise<unknown> | unknown;
  commitPrefsPatch: (patch: unknown) => Promise<unknown> | unknown;
}

export function createBackgroundDispatcher({
  executeMutation,
  commitPrefsPatch,
}: BackgroundDispatcherDependencies): BackgroundHandler {
  return (request) =>
    request.type === "mutation.execute"
      ? executeMutation(request.intent)
      : commitPrefsPatch(request.patch);
}

function nextRequestId(): string {
  return `tab-sorter:${crypto.randomUUID()}`;
}

const sendBackground = createBackgroundClient((request) => browser.runtime.sendMessage(request));

export function requestMutation<Intent extends MutationIntent>(
  intent: Intent,
): Promise<MutationResult<Intent>> {
  return sendBackground<MutationResult<Intent>>({
    v: 1,
    requestId: nextRequestId(),
    type: "mutation.execute",
    intent,
  });
}

export function requestPrefsPatch(patch: Partial<Prefs>): Promise<Prefs> {
  return sendBackground<Prefs>({
    v: 1,
    requestId: nextRequestId(),
    type: "prefs.patch",
    patch,
  });
}
