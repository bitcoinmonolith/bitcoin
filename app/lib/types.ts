export type PartialTuple<T extends readonly unknown[]> = T extends readonly [infer F, ...infer R]
	? readonly [F] | readonly [F, ...PartialTuple<R>]
	: T;
