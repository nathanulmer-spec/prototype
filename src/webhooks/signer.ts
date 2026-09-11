import { createHmac, timingSafeEqual } from "node:crypto";

export function signPayload(secret: string, payload: string, timestamp: number): string {
  const signedContent = `${timestamp}.${payload}`;
  const signature = createHmac("sha256", secret).update(signedContent).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

export function verifySignature(secret: string, payload: string, header: string): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((part) => part.split("=") as [string, string]),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
