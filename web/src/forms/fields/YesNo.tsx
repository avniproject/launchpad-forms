import { CodedRadio } from "./CodedRadio";
import type { FieldProps } from "./FieldShell";

// A radio whose options are exactly Yes/No — rendered on one row.
export function YesNo(props: FieldProps) {
  return <CodedRadio {...props} row />;
}
