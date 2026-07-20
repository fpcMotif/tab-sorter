import { toSlug } from "./lib/impl";

export function slugify(input: string): string {
  return toSlug(input);
}
