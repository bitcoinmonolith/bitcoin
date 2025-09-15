export type PartialTuple<T extends unknown[]> = T extends [infer F, ...infer R] ? [F] | [F, ...PartialTuple<R>] : T;
