import { describe, expect, it } from "vitest";
import { signPayload, verifySignature } from "../src/webhooks/signer.js";

describe("webhook signer", () => {
  it("produces a signature that verifies against the same payload and secret", () => {
    const secret = "whsec_test";
    const payload = JSON.stringify({ hello: "world" });
    const timestamp = 1700000000;
    const header = signPayload(secret, payload, timestamp);

    expect(verifySignature(secret, payload, header)).toBe(true);
  });

  it("rejects a payload that was tampered with after signing", () => {
    const secret = "whsec_test";
    const header = signPayload(secret, JSON.stringify({ amount: 100 }), 1700000000);

    expect(verifySignature(secret, JSON.stringify({ amount: 999 }), header)).toBe(false);
  });

  it("rejects a signature produced with a different secret", () => {
    const payload = JSON.stringify({ amount: 100 });
    const header = signPayload("whsec_a", payload, 1700000000);

    expect(verifySignature("whsec_b", payload, header)).toBe(false);
  });
});
