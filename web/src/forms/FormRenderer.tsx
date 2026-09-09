import { Paper, Typography } from "@mui/material";
import type { FieldErrors, FieldSpec, FieldValue, FieldValues, FormConfig } from "./types";
import { otherActive, otherFieldSpec } from "./effectiveFields";
import type { FieldProps } from "./fields/FieldShell";
import { Text } from "./fields/Text";
import { Email } from "./fields/Email";
import { Phone } from "./fields/Phone";
import { Notes } from "./fields/Notes";
import { NumberField } from "./fields/Number";
import { CodedRadio } from "./fields/CodedRadio";
import { CodedSelect } from "./fields/CodedSelect";
import { YesNo } from "./fields/YesNo";
import { Checkbox } from "./fields/Checkbox";

function isYesNo(field: FieldSpec): boolean {
  return field.options?.length === 2 && field.options[0] === "Yes" && field.options[1] === "No";
}

function renderField(field: FieldSpec, props: Omit<FieldProps, "field">) {
  const all = { field, ...props };
  switch (field.type) {
    case "email":
      return <Email {...all} />;
    case "phone":
      return <Phone {...all} />;
    case "number":
      return <NumberField {...all} />;
    case "notes":
      return <Notes {...all} />;
    case "select":
      return <CodedSelect {...all} />;
    case "radio":
      return isYesNo(field) ? <YesNo {...all} /> : <CodedRadio {...all} />;
    case "checkbox":
      return <Checkbox {...all} />;
    case "text":
    default:
      return <Text {...all} />;
  }
}

interface Props {
  config: FormConfig;
  values: FieldValues;
  errors: FieldErrors;
  onChange: (id: string, value: FieldValue) => void;
  onBlur: (id: string) => void;
}

export function FormRenderer({ config, values, errors, onChange, onBlur }: Props) {
  const fieldProps = (field: FieldSpec): Omit<FieldProps, "field"> => ({
    value: values[field.id],
    error: errors[field.id],
    onChange: (value) => onChange(field.id, value),
    onBlur: () => onBlur(field.id),
  });

  return (
    <>
      {config.sections.map((section) => (
        <Paper
          key={section.id}
          elevation={0}
          sx={{
            bgcolor: "#ffffff",
            borderRadius: "16px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
            p: { xs: 2.5, sm: 4 },
            mb: 3,
          }}
        >
          <Typography variant="h6" sx={{ mb: section.description ? 0.5 : 2 }}>
            {section.title}
          </Typography>
          {section.description && (
            <Typography sx={{ fontSize: 14, color: "text.secondary", mb: 2 }}>{section.description}</Typography>
          )}
          {section.fields.map((field) => (
            <div key={field.id}>
              {renderField(field, fieldProps(field))}
              {otherActive(field, values) &&
                (() => {
                  const other = otherFieldSpec(field);
                  return renderField(other, fieldProps(other));
                })()}
            </div>
          ))}
        </Paper>
      ))}
    </>
  );
}
