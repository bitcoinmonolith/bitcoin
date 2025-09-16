export type PartialTuple<T extends readonly unknown[]> =
	| T
	| (T extends readonly [infer F, ...infer R] ? readonly [F] | readonly [F, ...PartialTuple<R>]
		: T);
