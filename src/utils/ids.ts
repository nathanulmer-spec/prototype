import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const generate = customAlphabet(alphabet, 20);

export type IdPrefix =
  | "mer"
  | "ord"
  | "txn"
  | "inv"
  | "fb"
  | "whs"
  | "whd"
  | "cod"
  | "evt"
  | "ret"
  | "ntr"
  | "ntl";

export function makeId(prefix: IdPrefix): string {
  return `${prefix}_${generate()}`;
}
