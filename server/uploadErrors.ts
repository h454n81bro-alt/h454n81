function rawErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

export function isStorageUploadError(error: unknown) {
  const message = rawErrorMessage(error).toLowerCase();
  return message.includes("storage ") || message.includes("s3 ") || message.includes("presign") || message.includes("storage upload");
}

export function storageUploadErrorMessage(error: unknown) {
  const message = rawErrorMessage(error).toLowerCase();
  if (message.includes("413") || message.includes("payload too large") || message.includes("entity too large")) {
    return "Unggahan tidak dibatasi oleh aplikasi, tetapi layanan penyimpanan menolak ukuran berkas ini. Coba unggah lagi melalui koneksi stabil atau bagi berkas menjadi beberapa bagian.";
  }
  return "Berkas belum dapat disimpan oleh layanan penyimpanan. Coba lagi beberapa saat, atau periksa koneksi Anda.";
}
