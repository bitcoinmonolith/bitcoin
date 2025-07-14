// deno-lint-ignore-file no-explicit-any

export type IsUnion<T, U = T> = T extends any ? [U] extends [T] ? false
	: true
	: never;
