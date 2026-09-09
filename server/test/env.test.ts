import { describe, expect, it } from "vitest";
import { env, windowOpen, assertWindowConfig } from "../src/env.js";
import { setTestEnv } from "./helpers.js";

describe("registration window", () => {
  it("an unparseable REG_CLOSE closes the window rather than failing open", () => {
    // `now > new Date("garbage")` is false, so the naive check returned true
    // and the form kept accepting applications past the advertised close.
    setTestEnv({ REG_CLOSE: "5 October 2026 11:59 PM IST" });
    expect(windowOpen(env())).toBe(false);
  });

  it("an unparseable REG_OPEN closes the window", () => {
    setTestEnv({ REG_OPEN: "not-a-date" });
    expect(windowOpen(env())).toBe(false);
  });

  it("assertWindowConfig rejects a malformed bound at startup", () => {
    setTestEnv({ REG_CLOSE: "5 October 2026 11:59 PM IST" });
    expect(() => assertWindowConfig(env())).toThrow(/REG_CLOSE is not a valid date/);
  });

  it("assertWindowConfig accepts empty bounds and valid ISO 8601", () => {
    setTestEnv({ REG_OPEN: "", REG_CLOSE: "2026-10-05T23:59:59+05:30" });
    expect(() => assertWindowConfig(env())).not.toThrow();
    expect(windowOpen(env(), new Date("2026-09-09T10:00:00+05:30"))).toBe(true);
    expect(windowOpen(env(), new Date("2026-10-06T10:00:00+05:30"))).toBe(false);
  });
});
