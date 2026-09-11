import type { Merchant } from "../domain/merchant.js";

declare global {
  namespace Express {
    interface Request {
      merchant?: Merchant;
    }
  }
}

export {};
