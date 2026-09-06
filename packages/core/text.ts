// numeric so "tab 10" sorts after "tab 2"; base sensitivity so case/diacritics don't split domains.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function compareText(left: string, right: string): number {
  return collator.compare(left, right);
}
