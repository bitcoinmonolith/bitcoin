import { Codec } from "@nomadshiba/codec";
import { u48 } from "~/lib/primitives/U48.ts";

// Global pointer to anything stored on the chain
export type StoredPointer = Codec.Infer<typeof StoredPointer>;
export const StoredPointer = u48;
