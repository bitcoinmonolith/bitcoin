import { Codec, Vector } from "@nomadshiba/codec";
import { StoredTx } from "./StoredTx.ts";

export type StoredBlock = Codec.Infer<typeof StoredBlock>;
export const StoredBlock = new Vector(StoredTx);
