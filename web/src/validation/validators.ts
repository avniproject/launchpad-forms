// Ported from avni-website src/pages/signup/index.js (EmailValidator,
// PhoneValidator, NameValidator). The role-based-address rejection is
// deliberately dropped — NGOs legitimately apply from info@ / contact@.
import { isValidPhoneNumber } from "react-phone-number-input";
import type { FieldSpec, FieldValue } from "@/forms/types";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

const DISPOSABLE_EMAIL_DOMAINS = [
  "mailinator.com", "10minutemail.com", "guerrillamail.com", "tempmail.org",
  "throwaway.email", "temp-mail.org", "yopmail.com", "maildrop.cc",
];

const COMMON_TYPOS: Record<string, string> = {
  "gmil.com": "gmail.com",
  "gmai.com": "gmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "outlok.com": "outlook.com",
};

export function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, errors: ["Enter a valid email address"] };
  }

  const domain = email.split("@")[1]?.toLowerCase();

  if (domain && DISPOSABLE_EMAIL_DOMAINS.includes(domain)) {
    errors.push("Disposable email addresses are not allowed");
  }

  if (domain && COMMON_TYPOS[domain]) {
    errors.push(`Did you mean ${email.replace(domain, COMMON_TYPOS[domain])}?`);
  }

  return { isValid: errors.length === 0, errors };
}

export function validatePhone(phone: string): ValidationResult {
  // Values arrive from react-phone-number-input in E.164, country baked in.
  if (!isValidPhoneNumber(phone || "")) {
    return { isValid: false, errors: ["Enter a valid mobile number for the selected country"] };
  }
  return { isValid: true, errors: [] };
}

export function validateName(name: string, fieldName: string, disallowNumbers = true): ValidationResult {
  const errors: string[] = [];

  if (!name || name.trim().length === 0) {
    return { isValid: false, errors: [`${fieldName} is required`] };
  }

  const nameRegex = disallowNumbers ? /^[a-zA-Z\s\-'.]+$/ : /^[a-zA-Z0-9\s\-'.]+$/;
  const allowedChars = disallowNumbers
    ? "letters, spaces, hyphens and apostrophes"
    : "letters, numbers, spaces, hyphens and apostrophes";

  if (!nameRegex.test(name.trim())) {
    errors.push(`${fieldName} can only contain ${allowedChars}`);
  }

  if (name.trim().length < 2) {
    errors.push(`${fieldName} must be at least 2 characters long`);
  }

  return { isValid: errors.length === 0, errors };
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

// One field against its spec. Returns the first error message, or null.
export function validateField(field: FieldSpec, value: FieldValue | undefined): string | null {
  const empty =
    value === undefined || value === null || value === "" || (field.type === "checkbox" && value !== true);

  if (empty) {
    if (!field.required) return null;
    return field.type === "checkbox" ? "This confirmation is required" : "This field is required";
  }

  switch (field.type) {
    case "email": {
      const result = validateEmail(String(value));
      return result.isValid ? null : result.errors[0];
    }
    case "phone": {
      const result = validatePhone(String(value));
      return result.isValid ? null : result.errors[0];
    }
    case "number": {
      const n = Number(value);
      if (!Number.isInteger(n)) return "Enter a whole number";
      if (field.min !== undefined && n < field.min) return `Must be ${field.min} or later`;
      if (field.max !== undefined && n > field.max) return `Must be ${field.max} or earlier`;
      return null;
    }
    case "notes": {
      if (field.maxWords && countWords(String(value)) > field.maxWords) {
        return `Please keep this under ${field.maxWords} words`;
      }
      return null;
    }
    case "text": {
      if (field.id === "contactName") {
        const result = validateName(String(value), "Name");
        return result.isValid ? null : result.errors[0];
      }
      return null;
    }
    default:
      return null;
  }
}
