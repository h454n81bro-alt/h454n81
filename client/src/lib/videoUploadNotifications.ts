export type VideoUploadNotice = {
  tone: "info" | "success";
  title: string;
  description: string;
};

export function resumedUploadNotice(): VideoUploadNotice {
  return {
    tone: "info",
    title: "Unggahan dilanjutkan",
    description: "Bagian video yang sudah tersimpan dilewati. Melanjutkan dari checkpoint terakhir.",
  };
}

export function completedUploadNotice(): VideoUploadNotice {
  return {
    tone: "success",
    title: "Unggahan video lengkap",
    description: "Semua bagian sudah tersimpan. Subtitle Indonesia sedang diproses.",
  };
}
