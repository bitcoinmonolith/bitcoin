const JOB_WORKER_COUNT = navigator.hardwareConcurrency || 4;

export class JobPool<TData, TResult> {
	private readonly freeWorkers: Worker[] = [];

	constructor(workerScriptPath: string, workerCount = JOB_WORKER_COUNT) {
		for (let i = 0; i < workerCount; i++) {
			const worker = new Worker(workerScriptPath, { type: "module" });
			this.freeWorkers.push(worker);
		}
	}

	async queue(data: TData): Promise<TResult> {
		let worker: Worker | undefined;
		while (!worker) {
			worker = this.freeWorkers.pop();
			if (!worker) {
				await new Promise((r) => setTimeout(r, 10));
			}
		}

		const { promise, resolve } = Promise.withResolvers<TResult>();
		worker.onmessage = (event: MessageEvent<TResult>) => {
			const data = event.data as TResult;
			resolve(data);
		};
		worker.postMessage(data as TData);
		promise.finally(() => this.freeWorkers.push(worker!));
		return promise;
	}
}
