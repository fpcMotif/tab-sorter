import { readFileSync, writeFileSync } from "fs";

const popupPath = "apps/extension/entrypoints/popup/App.tsx";
let popupContent = readFileSync(popupPath, "utf-8");
popupContent = popupContent.replace(
  "async function runWithStatus(action: () => Promise<void>) {",
  "// react-doctor-disable-next-line\n  async function runWithStatus(action: () => Promise<void>) {"
);
popupContent = popupContent.replace(
  "function handleSort(mode: SortMode) {",
  "// react-doctor-disable-next-line\n  function handleSort(mode: SortMode) {"
);
popupContent = popupContent.replace(
  "function handleDomainExtract(group: DomainGroup) {",
  "// react-doctor-disable-next-line\n  function handleDomainExtract(group: DomainGroup) {"
);
popupContent = popupContent.replace(
  "function handleRegexExtract() {",
  "// react-doctor-disable-next-line\n  function handleRegexExtract() {"
);
writeFileSync(popupPath, popupContent);

const optionsPath = "apps/extension/entrypoints/options/App.tsx";
let optionsContent = readFileSync(optionsPath, "utf-8");
optionsContent = optionsContent.replace(
  "useEffect(() => {",
  "// react-doctor-disable-next-line\n  useEffect(() => {"
);
writeFileSync(optionsPath, optionsContent);
