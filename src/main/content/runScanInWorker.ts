import type { LibraryIndex, ScanProgress } from '@shared/content';
import createScannerWorker from './scanner.worker?nodeWorker';
import type { ScanFolder } from './scanLibrary';
import type { ScanRequest, ScanWorkerMessage } from './scannerProtocol';

export function runScanInWorker(
  folders: ScanFolder[],
  previous: LibraryIndex,
  onProgress: (progress: ScanProgress) => void,
): Promise<LibraryIndex> {
  return new Promise((resolve, reject) => {
    const request: ScanRequest = { folders, previous };
    const worker = createScannerWorker({ workerData: request });
    let settled = false;

    worker.on('message', (message: ScanWorkerMessage) => {
      if (message.type === 'progress') onProgress(message.progress);
      else if (message.type === 'done') {
        settled = true;
        resolve(message.index);
        void worker.terminate();
      } else {
        settled = true;
        reject(new Error(message.message));
        void worker.terminate();
      }
    });
    worker.on('error', (error: unknown) => {
      settled = true;
      reject(error instanceof Error ? error : new Error(String(error)));
    });
    worker.on('exit', (code) => {
      if (!settled) reject(new Error(`Scanner worker exited with code ${code}`));
    });
  });
}
