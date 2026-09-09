import type { FieldSpec, FieldValues, FormConfig } from "./types";

export function otherFieldSpec(parent: FieldSpec): FieldSpec {
  return { id: `${parent.id}Other`, label: "Please specify", type: "text", required: true };
}

export function otherActive(field: FieldSpec, values: FieldValues): boolean {
  return Boolean(
    field.other &&
      field.options &&
      field.options.length > 0 &&
      values[field.id] === field.options[field.options.length - 1],
  );
}

// The fields currently on screen, in render order — the config's fields plus
// any revealed `<id>Other` fields. Submit-time validation iterates this.
export function effectiveFields(config: FormConfig, values: FieldValues): FieldSpec[] {
  const list: FieldSpec[] = [];
  for (const section of config.sections) {
    for (const field of section.fields) {
      list.push(field);
      if (otherActive(field, values)) list.push(otherFieldSpec(field));
    }
  }
  return list;
}
