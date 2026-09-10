/// <reference types="vite/client" />

/**
 * TypeScript 5.6's lib.dom.d.ts ships `FileSystemDirectoryHandle` and
 * `FileSystemFileHandle` but not the async `values()` iterator on the
 * directory handle, nor `showDirectoryPicker` / `showSaveFilePicker`
 * on `Window`. These ambient declarations add the missing surface
 * used by the folder-pick features so the rest of the code can stay
 * strictly typed. The runtime still requires a Chromium-based browser.
 */
interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemHandle>;
}

interface Window {
  showDirectoryPicker(options?: {
    mode?: "read" | "readwrite";
    startIn?: FileSystemHandle | "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
  }): Promise<FileSystemDirectoryHandle>;

  showSaveFilePicker(options?: {
    suggestedName?: string;
    startIn?: FileSystemHandle | "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
    excludeAcceptAllOption?: boolean;
  }): Promise<FileSystemFileHandle>;
}