import { v4 as uuidv4 } from "uuid";

// Single place that generates element ids. `uuid` (unlike crypto.randomUUID)
// also works on plain-HTTP pages, which matters for internal-server deploys.
export function newId(): string {
  return uuidv4();
}
