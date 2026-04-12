export {};

declare global {
  namespace Express {
    interface Locals {
      emitEvent?: (eventName: string, payload: unknown) => void;
    }
  }
}
