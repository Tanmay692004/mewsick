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

// Shim isAvailableAsync if it's missing on StorageAccessFramework (SDK 52+ / Platform check)
if (FileSystem.StorageAccessFramework && !(FileSystem.StorageAccessFramework as any).isAvailableAsync) {
  Object.defineProperty(FileSystem.StorageAccessFramework, 'isAvailableAsync', {
    value: async () => Platform.OS === 'android',
    writable: true,
    configurable: true,
  });
}

export type LocalTrack = {
  uri: string;
  filename: string;
  cleanTitle: string;
};

/**
 * Checks if StorageAccessFramework is available on the current platform.
 */
export async function isStorageAccessFrameworkAvailable(): Promise<boolean> {
  return await FileSystem.StorageAccessFramework.isAvailableAsync();
}

/**
 * Request folder permissions using StorageAccessFramework
 */
export async function requestDirectoryPermission(): Promise<string | null> {
  try {
    const isSafAvailable = await FileSystem.StorageAccessFramework.isAvailableAsync();
    if (!isSafAvailable) {
      throw new Error('Storage Access Framework is not available on this device/platform.');
    }
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (permissions.granted) {
      return permissions.directoryUri;
    }
    return null;
  } catch (error) {
    console.error('Error requesting directory permission:', error);
    throw error;
  }
}

/**
 * Lists and decodes filenames from the chosen directory URI.
 * Sanitizes filenames to generate clean track titles.
 */
export async function scanLocalDirectory(directoryUri: string): Promise<LocalTrack[]> {
  try {
    const files = await FileSystem.StorageAccessFramework.readDirectoryAsync(directoryUri);
    return files.map((uri) => {
      const filename = getFilenameFromUri(uri);
      const cleanTitle = sanitizeFilename(filename);
      return {
        uri,
        filename,
        cleanTitle,
      };
    });
  } catch (error) {
    console.error('Error scanning local directory:', error);
    throw error;
  }
}

/**
 * Helper to extract and decode the filename from a StorageAccessFramework content URI.
 */
export function getFilenameFromUri(uri: string): string {
  const decoded = decodeURIComponent(uri);
  const parts = decoded.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

/**
 * Sanitizes filenames by stripping extensions (.mp3, .m4a, .wav, .webm, .mp4) and trimming spaces.
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/\.(mp3|m4a|wav|webm|mp4)$/i, '').trim();
}

/**
 * Normalizes strings by converting to lowercase, removing content inside brackets/parentheses,
 * removing special characters/punctuation, and normalizing spacing.
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s*[\[\({].*?[\]\)}]/g, '') // Remove brackets/parentheses and their content (e.g. [Official Video])
    .replace(/[^\w\s]/g, '')              // Remove non-alphanumeric and non-space characters
    .replace(/\s+/g, ' ')                 // Collapse multiple spaces into one
    .trim();
}

/**
 * High-end match heuristic for determining if an online track title matches a local file title.
 */
export function matchTracks(onlineTitle: string, localCleanTitle: string): boolean {
  const normOnline = normalizeString(onlineTitle);
  const normLocal = normalizeString(localCleanTitle);

  if (!normOnline || !normLocal) return false;
  if (normOnline === normLocal) return true;

  // If one is a substring of the other and length is reasonable (e.g. > 60% ratio)
  const maxLen = Math.max(normOnline.length, normLocal.length);
  if (maxLen > 6 && (normOnline.includes(normLocal) || normLocal.includes(normOnline))) {
    const minLen = Math.min(normOnline.length, normLocal.length);
    if (minLen / maxLen > 0.6) {
      return true;
    }
  }

  return false;
}
