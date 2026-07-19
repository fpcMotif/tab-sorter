export const PROTOCOL_ERROR_CODES = [
  "INTERNAL_ERROR",
  "INVALID_REQUEST",
  "MUTATION_FAILED",
  "RECOVERY_AMBIGUOUS",
  "RECOVERY_REQUIRED",
] as const;

export type ProtocolErrorCode = (typeof PROTOCOL_ERROR_CODES)[number];

const protocolErrorCodes = new Set<ProtocolErrorCode>(PROTOCOL_ERROR_CODES);

export function isProtocolErrorCode(value: unknown): value is ProtocolErrorCode {
  return protocolErrorCodes.has(value as ProtocolErrorCode);
}

export function protocolError(
  code: ProtocolErrorCode,
  message: string,
): Error & { code: ProtocolErrorCode } {
  return Object.assign(new Error(message), { code });
}
