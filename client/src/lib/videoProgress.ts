export type VideoProcessingPhase = "idle" | "reading" | "transcribing" | "translating" | "complete" | "error";

export const VIDEO_PROCESSING_PHASES: Record<Exclude<VideoProcessingPhase, "idle" | "complete" | "error">, { label: string; hint: string; percent: number }> = {
  reading: { label: "Membaca video", hint: "Mengunggah dan menyiapkan audio…", percent: 12 },
  transcribing: { label: "Mentranskripsikan audio", hint: "Mengubah ucapan menjadi cue bertimestamp…", percent: 42 },
  translating: { label: "Menerjemahkan subtitle", hint: "Menyusun subtitle bahasa Indonesia…", percent: 76 },
};

export function videoProgressFor(phase: VideoProcessingPhase) {
  if (phase === "complete") return { label: "Selesai", hint: "Subtitle Indonesia siap dibaca.", percent: 100 };
  if (phase === "error") return { label: "Gagal", hint: "Periksa pesan kesalahan lalu coba lagi.", percent: 100 };
  if (phase === "idle") return { label: "Siap", hint: "Pilih video untuk memulai.", percent: 0 };
  return VIDEO_PROCESSING_PHASES[phase];
}

export function summaryProgressFor(active: boolean) {
  return active
    ? { label: "Membuat ringkasan", hint: "Menyusun gagasan utama dari subtitle terbaru…", percent: 68 }
    : { label: "Ringkasan siap", hint: "Ringkasan dapat diunduh sebagai TXT atau PDF.", percent: 100 };
}

export function advanceProgress(percent: number, maximum = 92) {
  return Math.min(maximum, Math.max(0, percent + 4));
}
