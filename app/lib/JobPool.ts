import { delay } from "@std/async";

const JOB_WORKER_COUNT = navigator.hardwareConcurrency || 4;

export declare namespace JobPool {
	export type Result<T> = { data: T; workerIndex: number };
}

export class JobPool<TData, TResult> {
	private readonly freeWorkers: Worker[] = [];
	private readonly workerCount: number;

	constructor(workerScriptPath: string, workerCount = JOB_WORKER_COUNT) {
		this.workerCount = workerCount;
		for (let i = 0; i < workerCount; i++) {
			const worker = new Worker(workerScriptPath, { type: "module" });
			this.freeWorkers.push(worker);
		}
	}

	async queue(data: TData): Promise<JobPool.Result<TResult>> {
		let worker: Worker | undefined;
		let workerIndex = -1;
		while (!worker) {
			worker = this.freeWorkers.pop();
			workerIndex = this.workerCount - this.freeWorkers.length - 1;
			if (!worker) {
				await delay(10);
			}
		}

		const { promise, resolve } = Promise.withResolvers<JobPool.Result<TResult>>();
		worker.onmessage = (event: MessageEvent<TResult>) => {
			const data = event.data as TResult;
			resolve({ data, workerIndex });
		};
		worker.postMessage(data as TData);
		promise.finally(() => this.freeWorkers.push(worker!));
		return promise;
	}
}
