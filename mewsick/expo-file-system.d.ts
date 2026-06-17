declare module 'expo-file-system' {
  import * as FileSystemLegacy from 'expo-file-system/build/legacy/FileSystem';

  export const documentDirectory: string | null;
  export const cacheDirectory: string | null;
  export const bundleDirectory: string | null;

  export enum EncodingType {
    UTF8 = "utf8",
    Base64 = "base64"
  }

  export const getInfoAsync: typeof FileSystemLegacy.getInfoAsync;
  export const readAsStringAsync: typeof FileSystemLegacy.readAsStringAsync;
  export const getContentUriAsync: typeof FileSystemLegacy.getContentUriAsync;
  export const writeAsStringAsync: typeof FileSystemLegacy.writeAsStringAsync;
  export const deleteAsync: typeof FileSystemLegacy.deleteAsync;
  export const deleteLegacyDocumentDirectoryAndroid: typeof FileSystemLegacy.deleteLegacyDocumentDirectoryAndroid;
  export const moveAsync: typeof FileSystemLegacy.moveAsync;
  export const copyAsync: typeof FileSystemLegacy.copyAsync;
  export const makeDirectoryAsync: typeof FileSystemLegacy.makeDirectoryAsync;
  export const readDirectoryAsync: typeof FileSystemLegacy.readDirectoryAsync;
  export const getFreeDiskStorageAsync: typeof FileSystemLegacy.getFreeDiskStorageAsync;
  export const getTotalDiskCapacityAsync: typeof FileSystemLegacy.getTotalDiskCapacityAsync;
  export const downloadAsync: typeof FileSystemLegacy.downloadAsync;
  export const uploadAsync: typeof FileSystemLegacy.uploadAsync;
  export const createDownloadResumable: typeof FileSystemLegacy.createDownloadResumable;
  export const createUploadTask: typeof FileSystemLegacy.createUploadTask;

  export namespace StorageAccessFramework {
    export function getUriForDirectoryInRoot(folderName: string): string;
    export function requestDirectoryPermissionsAsync(initialFileUrl?: string | null): Promise<any>;
    export function readDirectoryAsync(dirUri: string): Promise<string[]>;
    export function makeDirectoryAsync(parentUri: string, dirName: string): Promise<string>;
    export function createFileAsync(parentUri: string, fileName: string, mimeType: string): Promise<string>;
    export const writeAsStringAsync: typeof FileSystemLegacy.writeAsStringAsync;
    export const readAsStringAsync: typeof FileSystemLegacy.readAsStringAsync;
    export const deleteAsync: typeof FileSystemLegacy.deleteAsync;
    export const moveAsync: typeof FileSystemLegacy.moveAsync;
    export const copyAsync: typeof FileSystemLegacy.copyAsync;
    export function isAvailableAsync(): Promise<boolean>;
  }
}
