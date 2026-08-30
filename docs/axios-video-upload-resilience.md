# Axios, Exponential Backoff, dan Checkpoint Lokal untuk Unggah Video

Dokumen ini memberikan pola praktis untuk mengatasi `Failed to fetch` atau `Network Error` saat mengunggah video. Contoh menggunakan **Axios** untuk aplikasi yang memakai REST/HTTP. Pada proyek Pustaka Terjemah saat ini, tRPC tetap digunakan untuk kontrak aplikasi; pola di bawah berguna bila Anda memiliki endpoint HTTP, worker eksternal, atau layanan unggah mandiri.

> **Prinsip utama:** retry hanya untuk kegagalan sementara, kirim file per chunk, dan simpan checkpoint metadata. Jangan menyimpan seluruh video besar di `localStorage`.

| Masalah | Respons yang disarankan |
|---|---|
| `Failed to fetch` / `Network Error` | Ulangi dengan backoff dan jitter; pertahankan checkpoint. |
| HTTP `408`, `425`, `429`, `500`, `502`, `503`, `504` | Ulangi dengan batas percobaan. |
| HTTP `400`, `401`, `403`, `404`, `413`, `422` | Jangan retry otomatis; tampilkan pesan tindakan pengguna. |
| PUT presigned diblokir CORS | Pindah ke fallback same-origin per chunk, bukan mengunggah seluruh file sebagai base64. |

## 1. Normalisasi error jaringan

```ts
import axios, { AxiosError } from "axios";

export type UploadFailure = {
  kind: "network" | "timeout" | "rate_limit" | "server" | "client" | "unknown";
  retryable: boolean;
  message: string;
};

export function normalizeUploadError(error: unknown): UploadFailure {
  if (!axios.isAxiosError(error)) {
    const message = error instanceof Error ? error.message : "Unggahan gagal.";
    if (/failed to fetch|network/i.test(message)) {
      return {
        kind: "network",
        retryable: true,
        message: "Koneksi ke penyimpanan video gagal. Checkpoint disimpan; pilih kembali file yang sama untuk melanjutkan.",
      };
    }
    return { kind: "unknown", retryable: false, message };
  }

  const status = error.response?.status;
  if (!status) {
    return {
      kind: error.code === "ECONNABORTED" ? "timeout" : "network",
      retryable: true,
      message: "Jaringan atau server unggah tidak merespons. Coba lagi; progres yang sudah selesai tetap disimpan.",
    };
  }
  if (status === 429) return { kind: "rate_limit", retryable: true, message: "Terlalu banyak permintaan. Sistem akan mencoba lagi." };
  if (status >= 500) return { kind: "server", retryable: true, message: "Layanan unggah sedang bermasalah. Sistem akan mencoba lagi." };
  return { kind: "client", retryable: false, message: `Unggahan ditolak (${status}). Periksa izin, file, atau tautan unggah.` };
}
```

## 2. Axios interceptor dengan retry exponential backoff

Tambahkan metadata retry pada konfigurasi internal agar interceptor tidak mengulang permintaan tanpa batas. Untuk unggah chunk, `Blob` dan `ArrayBuffer` dapat dikirim ulang; jangan otomatis retry stream `ReadableStream` yang sudah habis dibaca.

```ts
import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

type RetryConfig = InternalAxiosRequestConfig & {
  __retryCount?: number;
  __maxRetries?: number;
};

export const uploadHttp = axios.create({
  timeout: 30_000,
  withCredentials: true,
});

function sleep(milliseconds: number) {
  return new Promise<void>(resolve => setTimeout(resolve, milliseconds));
}

function retryDelay(attempt: number, baseMs = 500, maxMs = 12_000) {
  const capped = Math.min(maxMs, baseMs * 2 ** attempt);
  // Full jitter menghindari semua klien melakukan retry pada saat bersamaan.
  return Math.floor(Math.random() * capped);
}

function retryAfterMilliseconds(error: AxiosError) {
  const raw = error.response?.headers?.["retry-after"];
  const seconds = typeof raw === "string" ? Number(raw) : undefined;
  return Number.isFinite(seconds) ? Math.max(0, seconds! * 1000) : null;
}

uploadHttp.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;
    if (!config) return Promise.reject(error);

    const failure = normalizeUploadError(error);
    const retries = config.__retryCount ?? 0;
    const maxRetries = config.__maxRetries ?? 3;
    if (!failure.retryable || retries >= maxRetries) return Promise.reject(error);

    config.__retryCount = retries + 1;
    await sleep(retryAfterMilliseconds(error) ?? retryDelay(retries));
    return uploadHttp.request(config);
  },
);
```

Panggil dengan batas eksplisit:

```ts
async function putChunk(url: string, chunk: Blob, mimeType: string, signal?: AbortSignal) {
  await uploadHttp.put(url, chunk, {
    headers: { "Content-Type": mimeType || "application/octet-stream" },
    signal,
    __maxRetries: 3,
  } as RetryConfig);
}
```

## 3. Desain checkpoint chunk lokal

Untuk video besar, simpan **metadata checkpoint**, bukan duplikat seluruh byte video. Browser tidak dapat memulihkan akses ke file asli setelah halaman dimuat ulang tanpa pengguna memilihnya lagi; karena itu checkpoint perlu memverifikasi nama, ukuran, dan `lastModified` sebelum resume.

```ts
type UploadCheckpoint = {
  id: string;                 // UUID sesi server
  fileName: string;
  fileSize: number;
  lastModified: number;
  mimeType: string;
  chunkSize: number;
  uploadedIndexes: number[];
  checksums: Record<number, string>;
  updatedAt: number;
};

function checkpointKey(file: Pick<File, "name" | "size" | "lastModified">) {
  return `video-upload:${file.name}:${file.size}:${file.lastModified}`;
}

export function saveUploadCheckpoint(file: File, checkpoint: UploadCheckpoint) {
  localStorage.setItem(checkpointKey(file), JSON.stringify(checkpoint));
}

export function readUploadCheckpoint(file: Pick<File, "name" | "size" | "lastModified">) {
  const raw = localStorage.getItem(checkpointKey(file));
  if (!raw) return null;
  const checkpoint = JSON.parse(raw) as UploadCheckpoint;
  return checkpoint.fileName === file.name
    && checkpoint.fileSize === file.size
    && checkpoint.lastModified === file.lastModified
    ? checkpoint
    : null;
}
```

Setelah setiap chunk terkonfirmasi oleh server, perbarui checkpoint secara atomik dari perspektif UI:

```ts
function markChunkComplete(file: File, checkpoint: UploadCheckpoint, index: number, checksum: string) {
  const uploaded = new Set(checkpoint.uploadedIndexes);
  uploaded.add(index);
  const next: UploadCheckpoint = {
    ...checkpoint,
    uploadedIndexes: [...uploaded].sort((a, b) => a - b),
    checksums: { ...checkpoint.checksums, [index]: checksum },
    updatedAt: Date.now(),
  };
  saveUploadCheckpoint(file, next);
  return next;
}
```

## 4. IndexedDB bila Anda benar-benar perlu menyimpan byte chunk

Simpan byte chunk lokal hanya untuk mode offline terbatas, karena video cepat menghabiskan kuota perangkat. Terapkan `maxCachedBytes`, TTL, dan hapus chunk setelah server mengonfirmasinya.

```ts
const DB_NAME = "video-upload-cache";
const DB_VERSION = 1;

function openUploadDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("chunks")) {
        db.createObjectStore("chunks", { keyPath: ["sessionId", "partIndex"] });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheChunk(sessionId: string, partIndex: number, blob: Blob, checksum: string) {
  const db = await openUploadDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("chunks", "readwrite");
    tx.objectStore("chunks").put({ sessionId, partIndex, blob, checksum, byteSize: blob.size, createdAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function removeCachedChunk(sessionId: string, partIndex: number) {
  const db = await openUploadDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("chunks", "readwrite");
    tx.objectStore("chunks").delete([sessionId, partIndex]);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
```

## 5. Alur resume yang direkomendasikan

```text
Pilih file → buka/buat sesi → baca checkpoint → minta daftar part tersimpan server
  → untuk setiap part yang belum ada:
      hash → coba PUT presigned + retry
      → jika gagal jaringan: fallback same-origin
      → konfirmasi server → simpan checkpoint
  → finalisasi → hapus checkpoint dan cache IndexedDB
```

Sumber kebenaran untuk bagian yang selesai adalah **server**, bukan checkpoint lokal. Saat aplikasi dibuka ulang, gabungkan `uploadedIndexes` lokal dengan daftar bagian tersimpan yang dikembalikan server; server menang karena dapat bertahan antarperangkat.

## 6. Pengujian retry

```ts
import { expect, it, vi } from "vitest";

it("melakukan retry ketika koneksi gagal lalu berhasil", async () => {
  const put = vi.spyOn(uploadHttp, "put")
    .mockRejectedValueOnce(new Error("Network Error"))
    .mockResolvedValueOnce({ status: 200 } as never);

  await putChunk("https://storage.example/chunk", new Blob(["abc"]), "video/mp4");

  expect(put).toHaveBeenCalledTimes(2);
});

it("tidak melakukan retry untuk HTTP 403", async () => {
  const error = { response: { status: 403 }, config: { url: "/chunk" } } as unknown as AxiosError;
  expect(normalizeUploadError(error)).toMatchObject({ retryable: false, kind: "client" });
});
```

## Catatan implementasi

Gunakan Axios interceptor untuk endpoint HTTP yang memang memakai Axios. Jika aplikasi Anda menggunakan tRPC, letakkan retry dan fallback di fungsi uploader seperti `uploadVideoWithResume`, bukan memaksa Axios masuk ke kontrak tRPC. Apa pun klien HTTP-nya, pertahankan batas chunk, validasi checksum di server, dan checkpoint yang hanya dihapus setelah finalisasi berhasil.
