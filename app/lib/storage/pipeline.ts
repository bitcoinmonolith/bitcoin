const downloadBuffer = new SharedArrayBuffer(4 * 1024 * 1024); // 4MB
const downloadWorker = new Worker(import.meta.resolve("./workers/download.ts"), { type: "module" });
