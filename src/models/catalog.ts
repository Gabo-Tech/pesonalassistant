import { Directory, File, Paths } from 'expo-file-system';

/**
 * Model files are far too big to ship inside the APK (the Metro bundler also caps
 * assets at 2GB), so the user downloads them once into the app's document directory.
 * This is the only network traffic the assistant ever makes, and the user starts it.
 */

export type ModelKind = 'llm' | 'stt';

export type ModelSpec = {
  id: string;
  kind: ModelKind;
  label: string;
  note: string;
  /** Bytes, from the server's content-length. Used for the progress bar and disk checks. */
  bytes: number;
  url: string;
  fileName: string;
};

export const MODELS: ModelSpec[] = [
  {
    id: 'qwen2.5-1.5b-q4',
    kind: 'llm',
    label: 'Qwen2.5 1.5B Instruct (Q4_K_M)',
    note: 'Recommended. Good tool-calling for its size.',
    bytes: 1_117_320_736,
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  },
  {
    id: 'qwen2.5-0.5b-q4',
    kind: 'llm',
    label: 'Qwen2.5 0.5B Instruct (Q4_K_M)',
    note: 'Fastest, lowest RAM. Weaker at multi-step requests.',
    bytes: 491_400_032,
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
  },
  {
    id: 'qwen2.5-3b-q4',
    kind: 'llm',
    label: 'Qwen2.5 3B Instruct (Q4_K_M)',
    note: 'Best quality. Needs roughly 6GB+ of RAM.',
    bytes: 2_104_932_768,
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-3b-instruct-q4_k_m.gguf',
  },
  {
    id: 'whisper-tiny-en',
    kind: 'stt',
    label: 'Whisper tiny.en (Q5_1)',
    note: 'Recommended. Fast enough for continuous wake-word listening.',
    bytes: 32_166_155,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en-q5_1.bin',
    fileName: 'ggml-tiny.en-q5_1.bin',
  },
  {
    id: 'whisper-base-en',
    kind: 'stt',
    label: 'Whisper base.en (Q5_1)',
    note: 'More accurate, noticeably slower on older phones.',
    bytes: 59_721_011,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q5_1.bin',
    fileName: 'ggml-base.en-q5_1.bin',
  },
];

export const modelsDir = (): Directory => new Directory(Paths.document, 'models');

export function modelFile(spec: ModelSpec): File {
  return new File(modelsDir(), spec.fileName);
}

export function isDownloaded(spec: ModelSpec): boolean {
  try {
    const file = modelFile(spec);
    // A partial download (killed mid-transfer) exists but is short, so check the size.
    return file.exists && (file.size ?? 0) >= spec.bytes * 0.98;
  } catch {
    return false;
  }
}

export function localPath(spec: ModelSpec): string | null {
  return isDownloaded(spec) ? modelFile(spec).uri : null;
}

export function ensureModelsDir(): void {
  const dir = modelsDir();
  if (!dir.exists) dir.create({ intermediates: true });
}

export type DownloadHandle = {
  promise: Promise<string>;
  cancel: () => void;
};

/**
 * Downloads a model with progress. Uses a download *task* rather than the one-shot
 * helper so the user can watch a multi-gigabyte transfer and cancel it.
 */
export function downloadModel(
  spec: ModelSpec,
  onProgress: (fraction: number, bytesWritten: number) => void,
): DownloadHandle {
  ensureModelsDir();

  const destination = modelFile(spec);
  if (destination.exists) destination.delete();

  const task = File.createDownloadTask(spec.url, destination, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      const total = totalBytes && totalBytes > 0 ? totalBytes : spec.bytes;
      onProgress(Math.min(1, bytesWritten / total), bytesWritten);
    },
  });

  // downloadAsync resolves with null if the task gets paused rather than finishing.
  const promise = task.downloadAsync().then((file) => {
    if (!file) throw new Error('Download was interrupted');
    return file.uri;
  });

  return {
    promise,
    cancel: () => {
      try {
        task.cancel();
      } catch {
        // Already finished.
      }
    },
  };
}

export function deleteModel(spec: ModelSpec): void {
  const file = modelFile(spec);
  if (file.exists) file.delete();
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  return `${Math.round(bytes / 1000)} kB`;
}
