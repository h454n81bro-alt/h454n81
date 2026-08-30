export function validatePublicVideoLink(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return "Gunakan tautan HTTP atau HTTPS.";
    if (!url.hostname || url.hostname === "localhost" || url.hostname.endsWith(".local")) return "Gunakan tautan video publik, bukan alamat internal.";
    return null;
  } catch {
    return "Masukkan tautan video publik yang valid.";
  }
}

export function publicVideoDownloadState(url: string, isPending: boolean) {
  const validationError = validatePublicVideoLink(url);
  return {
    canSubmit: !isPending && validationError === null,
    validationError,
    buttonLabel: isPending ? "Mengunduh dan memproses…" : "Unduh & Proses Video",
  };
}

export function publicVideoLinkGuidance(message: string | undefined) {
  if (!message?.includes("halaman web, bukan berkas video langsung")) return null;
  return "Tautan ini adalah halaman publik, bukan file video. Gunakan tombol unduh resmi di situs tersebut lalu unggah file videonya di panel Video, atau masukkan URL file media publik langsung dari penyimpanan/cloud Anda.";
}
