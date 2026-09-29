import { parentPort, workerData } from 'node:worker_threads';
import { scanLibrary } from './scanLibrary';
import type { ScanRequest, ScanWorkerMessage } from './scannerProtocol';

// Hashing and header parsing run off the main process thread so IPC stays responsive.
const port = parentPort;
if (!port) throw new Error('scanner.worker must run as a worker thread');

const post = (message: ScanWorkerMessage): void => {
  port.postMessage(message);
};

const request = workerData as ScanRequest;

scanLibrary({
  folders: request.folders,
  previous: request.previous,
  onProgress: (progress) => {
    post({ type: 'progress', progress });
  },
})
  .then((index) => {
    post({ type: 'done', index });
  })
  .catch((error: unknown) => {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  });
