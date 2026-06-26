type FieldValue = string | number | null;
type Row = FieldValue[];

const DELIMITER = ",";

// If a string has leading or trailing space,
// or contains a comma, double quote, or a newline
// it needs to be quoted in CSV output
const rxNeedsQuoting = /^\s|\s$|,|"|\n/;

export const stringifyCSVRows = (rows: Row[]): string =>
  rows.map((row) => stringifyCSVRow(row)).join("\n");

export const stringifyCSVRow = (row: Row): string =>
  row.map((val) => stringifyFieldValue(val)).join(DELIMITER);

function stringifyFieldValue(fieldValue: FieldValue): string {
  if (fieldValue == null) {
    return "";
  }

  if (typeof fieldValue === "string" && rxNeedsQuoting.test(fieldValue)) {
    return `"${fieldValue.replace(/"/g, '""')}"`;
  }

  if (typeof fieldValue === "number") {
    return fieldValue.toString(10);
  }

  return fieldValue;
}
