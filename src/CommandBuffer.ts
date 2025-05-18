export class CommandBuffer<T> {
	private active: T[] = [];

	push(item: T): void {
		this.active.push(item);
	}

	consume(): Iterable<T> {
		const current = this.active;
		this.active = [];
		return current.values();
	}
}
