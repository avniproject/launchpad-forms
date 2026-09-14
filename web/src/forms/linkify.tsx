import { Link } from "@mui/material";
import type { ReactNode } from "react";

// Renders the small amount of markup allowed in server-supplied form text:
//
//   **bold**              -> <strong>, and may contain a link
//   [label](url)          -> labelled link
//   <url> / bare url      -> link on the url itself
//   name@example.org      -> mailto link
//
// Used for the form intro and for field descriptions, so the two never
// diverge. Anything else is left as plain text — this is deliberately not a
// markdown engine.

// Angle-bracket autolinks are unwrapped up front; otherwise the bare-URL
// pattern would swallow the closing ">" into the href.
const ANGLE_URL = /<(https?:\/\/[^\s>]+)>/g;

const BOLD = /\*\*(.+?)\*\*/gs;

// The labelled-link alternative comes first so the whole [label](url) is
// consumed rather than the bare URL inside it.
const LINK =
  /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;
const LABELLED = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/;
const EMAIL = /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/;

// Trailing sentence punctuation is part of the sentence, not the address.
const TRAILING = /[.,;:!?)]+$/;

function links(text: string, keyPrefix: string): ReactNode[] {
  return text.split(LINK).map((part, i) => {
    const key = `${keyPrefix}${i}`;

    const labelled = LABELLED.exec(part);
    if (labelled) {
      return (
        <Link key={key} href={labelled[2]} target="_blank" rel="noopener noreferrer">
          {labelled[1]}
        </Link>
      );
    }

    if (part.startsWith("http://") || part.startsWith("https://")) {
      const trailing = TRAILING.exec(part)?.[0] ?? "";
      const href = trailing ? part.slice(0, -trailing.length) : part;
      return (
        <span key={key}>
          <Link href={href} target="_blank" rel="noopener noreferrer">
            {href}
          </Link>
          {trailing}
        </span>
      );
    }

    if (EMAIL.test(part)) {
      return (
        <Link key={key} href={`mailto:${part}`}>
          {part}
        </Link>
      );
    }

    return part;
  });
}

export function linkify(text: string): ReactNode[] {
  const source = text.replace(ANGLE_URL, "$1");
  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  BOLD.lastIndex = 0;
  while ((match = BOLD.exec(source)) !== null) {
    if (match.index > last) out.push(...links(source.slice(last, match.index), `p${last}-`));
    out.push(<strong key={`b${match.index}`}>{links(match[1], `b${match.index}-`)}</strong>);
    last = match.index + match[0].length;
  }
  if (last < source.length) out.push(...links(source.slice(last), `p${last}-`));

  return out;
}
