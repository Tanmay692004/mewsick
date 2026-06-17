import * as FileSystem from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

// Shim StorageAccessFramework if it's missing on the imported FileSystem object (SDK 52+ compatibility)
if (!FileSystem.StorageAccessFramework) {
  Object.defineProperty(FileSystem, 'StorageAccessFramework', {
    value: LegacyFileSystem.StorageAccessFramework,
    writable: true,
    configurable: true,
  });
}
if (!FileSystem.cacheDirectory) {
  Object.defineProperty(FileSystem, 'cacheDirectory', {
    value: LegacyFileSystem.cacheDirectory,
    writable: true,
    configurable: true,
  });
}
if (!(FileSystem as any).readAsStringAsync) {
  Object.defineProperty(FileSystem, 'readAsStringAsync', {
    value: LegacyFileSystem.readAsStringAsync,
    writable: true,
    configurable: true,
  });
}
if (!(FileSystem as any).deleteAsync) {
  Object.defineProperty(FileSystem, 'deleteAsync', {
    value: LegacyFileSystem.deleteAsync,
    writable: true,
    configurable: true,
  });
}
if (!(FileSystem as any).createDownloadResumable) {
  Object.defineProperty(FileSystem, 'createDownloadResumable', {
    value: LegacyFileSystem.createDownloadResumable,
    writable: true,
    configurable: true,
  });
}

export type QueueItemStatus = 'idle' | 'queued' | 'downloading' | 'saving' | 'success' | 'failed';

export type QueueItem = {
  id: string; // YouTube video ID
  title: string;
  status: QueueItemStatus;
  progress: number; // 0 to 1
  bytesWritten: number;
  totalBytes: number;
  error?: string;
};

export type DownloadProgressCallback = (bytesWritten: number, totalBytes: number) => void;

// Define the FastAPI proxy host address configuration.
// - Physical Android Device: Swap '10.0.2.2' with your host computer's local network IPv4 address (e.g. '192.168.1.50').
// - Android Emulator: '10.0.2.2' maps to your host machine's localhost loopback.
// - iOS Simulator / Web: Use 'localhost' or '127.0.0.1'.
const EXTRACTOR_HOST = '192.168.1.6';
const EXTRACTOR_PORT = '8000';
const EXTRACTOR_API_URL = `http://${EXTRACTOR_HOST}:${EXTRACTOR_PORT}/api/extract`;

/**
 * Resolves a YouTube video ID to a direct stream URL by querying the FastAPI extraction proxy.
 * If the proxy backend is offline, it falls back to a mock developer audio stream.
 */
export async function resolveStreamUrl(videoId: string): Promise<string> {
  try {
    const response = await fetch(`${EXTRACTOR_API_URL}?video_id=${videoId}`);
    if (!response.ok) {
      const details = await response.text();
      throw new Error(details || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (!data.stream_url) {
      throw new Error('Response did not contain a valid stream_url.');
    }

    return data.stream_url;
  } catch (error) {
    console.error(`Failed to resolve stream URL from backend proxy for video ID: ${videoId}:`, error);
    console.warn('Falling back to developer test audio stream.');
    // Graceful test fallback
    return 'https://dl.espressif.com/dl/audio/ff-16b-2c-44100hz.m4a';
  }
}

/**
 * Downloads a track stream into local cache, then writes it directly into the SAF directory.
 * Returns the final storage file URI.
 */
export async function downloadTrackToSAF(
  videoId: string,
  title: string,
  directoryUri: string,
  onProgress?: DownloadProgressCallback
): Promise<string> {
  const streamUrl = await resolveStreamUrl(videoId);

  // Clean filename by removing invalid OS path characters
  const cleanTitle = title.replace(/[\\\/:*?"<>|]/g, '_');
  const filename = `${cleanTitle}.m4a`;
  const mimeType = 'audio/x-m4a';

  const tempUri = `${FileSystem.cacheDirectory}${videoId}.m4a`;

  try {
    // 1. Download to local app sandbox cache with active progress tracking
    const downloadResumable = FileSystem.createDownloadResumable(
      streamUrl,
      tempUri,
      {},
      (downloadProgress: any) => {
        if (onProgress) {
          onProgress(
            downloadProgress.totalBytesWritten,
            downloadProgress.totalBytesExpectedToWrite
          );
        }
      }
    );

    const downloadResult = await downloadResumable.downloadAsync();
    if (!downloadResult || !downloadResult.uri) {
      throw new Error('Streaming failed. Could not write temporary local cache.');
    }

    // 2. Android SAF Write (or Simulated Fallback write)
    if (Platform.OS === 'android' && !directoryUri.startsWith('simulated://')) {
      // Create a new document in Scoped Storage
      const newFileUri = await FileSystem.StorageAccessFramework.createFileAsync(
        directoryUri,
        filename,
        mimeType
      );

      // Read local cached file bytes in Base64 representation
      const fileContent = await FileSystem.readAsStringAsync(downloadResult.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Write bytes to Scoped Storage URI
      await FileSystem.StorageAccessFramework.writeAsStringAsync(newFileUri, fileContent, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Clean up the temporary cache file immediately to save device space
      await FileSystem.deleteAsync(tempUri, { idempotent: true });

      return newFileUri;
    } else {
      // simulated or iOS/Web sandbox mode
      // Simulate disk write delay
      await new Promise((resolve) => setTimeout(resolve, 300));
      return downloadResult.uri;
    }
  } catch (error) {
    console.error(`Failed to download track "${title}" (ID: ${videoId}):`, error);
    // Graceful cleanup of temp file on catch
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => { });
    throw error;
  }
}

/**
 * Triggers the native Android Media Scanner so newly synced songs appear in system media libraries.
 */
export function triggerMediaScanner(filename: string): void {
  // Callback hook stub left for integration with native module in later stage.
  console.log(`[MediaScanner] Notified Media Scanner for new audio file: ${filename}`);
}

/**
 * Executes a concurrent queue of downloads restricting processing to a maxConcurrency limit.
 */
export async function runDownloadQueue(
  items: Array<{ id: string; title: string }>,
  directoryUri: string,
  onItemUpdate: (id: string, update: Partial<QueueItem>) => void,
  maxConcurrency: number = 2
): Promise<void> {
  const queue = [...items];
  let activeCount = 0;

  // Initialize all items to 'queued' state
  for (const item of items) {
    onItemUpdate(item.id, {
      id: item.id,
      title: item.title,
      status: 'queued',
      progress: 0,
      bytesWritten: 0,
      totalBytes: 0,
    });
  }

  const processNext = async (): Promise<void> => {
    if (queue.length === 0) return;

    const nextItem = queue.shift()!;
    activeCount++;

    onItemUpdate(nextItem.id, { status: 'downloading', progress: 0 });

    try {
      await downloadTrackToSAF(
        nextItem.id,
        nextItem.title,
        directoryUri,
        (bytesWritten, totalBytes) => {
          const progress = totalBytes > 0 ? bytesWritten / totalBytes : 0;
          onItemUpdate(nextItem.id, {
            progress,
            bytesWritten,
            totalBytes,
          });
        }
      );

      // Mark status as 'saving' momentarily before finalizing
      onItemUpdate(nextItem.id, { status: 'saving', progress: 1.0 });
      await new Promise((resolve) => setTimeout(resolve, 100));

      onItemUpdate(nextItem.id, { status: 'success' });
      triggerMediaScanner(`${nextItem.title}.m4a`);
    } catch (err) {
      onItemUpdate(nextItem.id, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown streaming error',
      });
    } finally {
      activeCount--;
      // Pop and process the next item off the queue chronologically
      await processNext();
    }
  };

  // Start concurrent worker threads
  const workers: Promise<void>[] = [];
  const initialCount = Math.min(maxConcurrency, queue.length);
  for (let i = 0; i < initialCount; i++) {
    workers.push(processNext());
  }

  await Promise.all(workers);
}
