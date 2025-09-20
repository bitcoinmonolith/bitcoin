export declare namespace LockManager {
	export interface Unlocker extends Disposable {
		unlock(): void;
	}
}
export class LockManager {
	private current: Promise<void> = Promise.resolve();

	async lock(): Promise<LockManager.Unlocker> {
		const { promise, resolve } = Promise.withResolvers<void>();
		const unlocker: LockManager.Unlocker = { [Symbol.dispose]: resolve, unlock: resolve };
		const prev = this.current;
		this.current = prev.then(() => promise);
		await prev;
		return unlocker;
	}
}
