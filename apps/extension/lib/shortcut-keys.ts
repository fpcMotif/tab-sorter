export function shortcutKeys(platform: string, key: string): string[] {
  return platform.startsWith("Mac") ? ["⌥", "⇧", key] : ["Alt", "Shift", key];
}

export function shortcutText(platform: string, key: string): string {
  return shortcutKeys(platform, key).join(platform.startsWith("Mac") ? "" : "+");
}
