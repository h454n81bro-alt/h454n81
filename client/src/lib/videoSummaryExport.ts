export type VideoSummaryData = {
  filenameBase: string;
  content: string;
};

export function createVideoSummaryExport(summary: VideoSummaryData, format: "txt" | "pdf") {
  return {
    filename: `${summary.filenameBase}.${format}`,
    content: summary.content,
    mimeType: format === "txt" ? "text/plain;charset=utf-8" : "application/pdf",
  };
}
