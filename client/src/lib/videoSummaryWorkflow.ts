import { createVideoSummaryExport, type VideoSummaryData } from "./videoSummaryExport";

export async function persistSubtitleCorrection(submitCorrection: () => Promise<unknown>, refreshVideoAndSummary: () => Promise<unknown>) {
  await submitCorrection();
  await refreshVideoAndSummary();
}

export async function refetchLatestVideoSummaryExport(
  format: "txt" | "pdf",
  refetchSummary: () => Promise<{ data?: VideoSummaryData }>
) {
  const response = await refetchSummary();
  if (!response.data) throw new Error("Ringkasan belum tersedia.");
  return createVideoSummaryExport(response.data, format);
}
