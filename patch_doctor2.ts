import { readFileSync, writeFileSync } from "fs";

const popupPath = "apps/extension/entrypoints/popup/App.tsx";
let popupContent = readFileSync(popupPath, "utf-8");
popupContent = popupContent.replace(
  "void runWithStatus(async () => {",
  "// react-doctor-disable-next-line\n    void runWithStatus(async () => {"
);
writeFileSync(popupPath, popupContent);
