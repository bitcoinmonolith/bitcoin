export class WeakRefMap<K, V extends object> {
	private cacheMap = new Map<K, WeakRef<V>>();
	private finalizer = new FinalizationRegistry((key: K) => {
		this.cacheMap.delete(key);
	});

	set(key: K, value: V): void {
		const cache = this.get(key);
		if (cache) {
			if (cache === value) return;
			this.finalizer.unregister(cache);
		}
		this.cacheMap.set(key, new WeakRef(value));
		this.finalizer.register(value, key, value);
	}

	get(key: K): V | undefined {
		return this.cacheMap.get(key)?.deref();
	}
}
