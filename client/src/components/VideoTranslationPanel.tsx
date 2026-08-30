import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { activeCueId, createIndonesianVtt, type PlaybackCue } from "@/lib/videoSubtitles";
import { DEFAULT_VIDEO_SUBTITLE_PREFERENCES, persistVideoSubtitlePreferences, readVideoSubtitlePreferences, subtitleOverlayStyle, type VideoSubtitlePreferences } from "@/lib/videoSubtitlePreferences";
import { createVideoSummaryExport } from "@/lib/videoSummaryExport";
import { persistSubtitleCorrection, refetchLatestVideoSummaryExport } from "@/lib/videoSummaryWorkflow";
import { advanceProgress, summaryProgressFor, videoProgressFor, type VideoProcessingPhase } from "@/lib/videoProgress";
import { uploadVideoWithResume, videoUploadFailureMessage } from "@/lib/resumableVideoUpload";
import { completedUploadNotice, resumedUploadNotice, type VideoUploadNotice } from "@/lib/videoUploadNotifications";
import { publicVideoLinkGuidance } from "@/lib/publicVideoLink";
import { CheckCircle2, Download, FileText, FileVideo, Link2, Loader2, Palette, Pencil, Save, UploadCloud, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type VideoLanguage = "auto" | "arabic" | "english" | "malay" | "turkish" | "french" | "german" | "spanish" | "japanese";

function mimeFromVideoFile(file: File) {
  return file.type || "application/octet-stream";
}

function downloadText(filename: string, content: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function VideoTranslationPanel({ open, onClose, focusVideoId }: { open: boolean; onClose: () => void; focusVideoId?: number | null }) {
  const utils = trpc.useUtils();
  const [url, setUrl] = useState("");
  const [selectedVideoId, setSelectedVideoId] = useState<number | null>(null);
  const [language, setLanguage] = useState<VideoLanguage>("auto");
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const [preferences, setPreferences] = useState<VideoSubtitlePreferences>(readVideoSubtitlePreferences);
  const [editingCueId, setEditingCueId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [processingPhase, setProcessingPhase] = useState<VideoProcessingPhase>("idle");
  const [processingPercent, setProcessingPercent] = useState(0);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<VideoUploadNotice | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resumeNoticeShown = useRef(false);
  const videos = trpc.videos.list.useQuery(undefined, { enabled: open });
  const detail = trpc.videos.get.useQuery({ videoId: selectedVideoId ?? 0 }, { enabled: open && Boolean(selectedVideoId) });
  const resumeInit = trpc.videos.resumeInit.useMutation();
  const resumePreparePart = trpc.videos.resumePreparePart.useMutation();
  const resumeConfirmPart = trpc.videos.resumeConfirmPart.useMutation();
  const resumeFallbackPart = trpc.videos.resumeFallbackPart.useMutation();
  const resumeComplete = trpc.videos.resumeComplete.useMutation();
  const importUrl = trpc.videos.importPublicUrl.useMutation();
  const updateCue = trpc.videos.updateCue.useMutation();
  const subtitleSrt = trpc.videos.subtitle.useQuery({ videoId: selectedVideoId ?? 0, format: "srt" }, { enabled: false });
  const subtitleVtt = trpc.videos.subtitle.useQuery({ videoId: selectedVideoId ?? 0, format: "vtt" }, { enabled: false });
  const summary = trpc.videos.summary.useQuery({ videoId: selectedVideoId ?? 0 }, { enabled: false });
  const videoDownload = trpc.videos.download.useQuery({ videoId: selectedVideoId ?? 0 }, { enabled: false });
  const conversion8k = trpc.videos.conversion8kStatus.useQuery({ videoId: selectedVideoId ?? 0 }, { enabled: open && Boolean(selectedVideoId), refetchInterval: 5000 });
  const request8k = trpc.videos.request8kConversion.useMutation({
    onSuccess: async () => {
      await conversion8k.refetch();
      toast.success("Konversi 8K telah diantrikan.");
    },
  });
  const isProcessing = resumeUploading || resumeInit.isPending || resumePreparePart.isPending || resumeConfirmPart.isPending || resumeFallbackPart.isPending || resumeComplete.isPending || importUrl.isPending;
  const processingStatus = videoProgressFor(processingPhase);
  const summaryStatus = summaryProgressFor(summaryBusy);
  const playbackCues = (detail.data?.cues ?? []) as PlaybackCue[];
  const vttUrl = useMemo(() => playbackCues.length ? URL.createObjectURL(new Blob([createIndonesianVtt(playbackCues)], { type: "text/vtt" })) : null, [playbackCues]);
  useEffect(() => () => { if (vttUrl) URL.revokeObjectURL(vttUrl); }, [vttUrl]);
  useEffect(() => { persistVideoSubtitlePreferences(preferences); }, [preferences]);
  useEffect(() => { if (open && focusVideoId) setSelectedVideoId(focusVideoId); }, [open, focusVideoId]);
  useEffect(() => {
    if (!isProcessing) return;
    const timer = window.setInterval(() => setProcessingPercent(current => advanceProgress(current)), 900);
    return () => window.clearInterval(timer);
  }, [isProcessing]);
  useEffect(() => {
    if (isProcessing) return;
    setProcessingPercent(current => processingPhase === "complete" ? 100 : current);
  }, [isProcessing, processingPhase]);
  const activeCue = activeCueId(playbackCues, playbackSeconds);
  const activeCueText = playbackCues.find(cue => cue.id === activeCue)?.indonesianText ?? playbackCues.find(cue => cue.id === activeCue)?.sourceText;

  const refresh = async (videoId = selectedVideoId) => {
    await Promise.all([utils.videos.list.invalidate(), videoId ? utils.videos.get.invalidate({ videoId }) : Promise.resolve(), videoId ? utils.videos.summary.invalidate({ videoId }) : Promise.resolve()]);
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    const mimeType = mimeFromVideoFile(file);
    try {
      setUploadNotice(null);
      resumeNoticeShown.current = false;
      setResumeUploading(true);
      setProcessingPhase("reading");
      setProcessingPercent(4);
      const result = await uploadVideoWithResume(file, mimeType, language, {
        resumeInit: input => resumeInit.mutateAsync(input as Parameters<typeof resumeInit.mutateAsync>[0]),
        resumePreparePart: input => resumePreparePart.mutateAsync(input),
        resumeConfirmPart: input => resumeConfirmPart.mutateAsync(input),
        resumeFallbackPart: input => resumeFallbackPart.mutateAsync(input),
        resumeComplete: input => resumeComplete.mutateAsync(input),
      }, progress => {
        setProcessingPhase("reading");
        setProcessingPercent(Math.min(38, Math.max(4, Math.round((progress.uploadedBytes / progress.totalBytes) * 38))));
        if (progress.resumed && !resumeNoticeShown.current) {
          const notice = resumedUploadNotice();
          resumeNoticeShown.current = true;
          setUploadNotice(notice);
          toast.info(notice.title, { description: notice.description });
        }
        if (progress.phase === "uploaded") {
          const notice = completedUploadNotice();
          setUploadNotice(notice);
          toast.success(notice.title, { description: notice.description });
        }
      });
      setProcessingPhase("transcribing");
      setProcessingPercent(42);
      setProcessingPhase("translating");
      setProcessingPercent(76);
      setSelectedVideoId(result.videoId);
      await refresh(result.videoId);
      setProcessingPhase("complete");
      setProcessingPercent(100);
      toast.success(result.cueCount ? `${result.cueCount} cue subtitle Indonesia berhasil dibuat.` : "Unggahan sebelumnya telah selesai diproses.");
    } catch (error) { setProcessingPhase("error"); setProcessingPercent(100); toast.error(`${videoUploadFailureMessage(error)} Pilih kembali berkas yang sama untuk melanjutkan unggahan.`); }
    finally { setResumeUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const handlePublicUrl = async () => {
    if (!url.trim()) return toast.error("Masukkan tautan video publik langsung.");
    try {
      setProcessingPhase("reading");
      setProcessingPercent(12);
      const result = await importUrl.mutateAsync({ url: url.trim(), sourceLanguage: language });
      if (!("videoId" in result) || typeof result.videoId !== "number") {
        setProcessingPhase("idle");
        setProcessingPercent(0);
        toast.info(result.guidance ?? "Tautan ini adalah halaman publik. Gunakan unduhan resmi lalu unggah file video.", { action: { label: "Buka sumber", onClick: () => window.open(result.sourcePageUrl ?? url.trim(), "_blank", "noopener,noreferrer") } });
        return;
      }
      setProcessingPhase("transcribing");
      setProcessingPercent(42);
      setSelectedVideoId(result.videoId);
      setProcessingPhase("translating");
      setProcessingPercent(76);
      setUrl("");
      await refresh(result.videoId);
      setProcessingPhase("complete");
      setProcessingPercent(100);
      toast.success(`${result.cueCount} cue subtitle Indonesia berhasil dibuat.`);
    } catch (error) {
      setProcessingPhase("error");
      setProcessingPercent(100);
      const message = error instanceof Error ? error.message : undefined;
      toast.error(publicVideoLinkGuidance(message) ?? message ?? "Tautan video belum dapat diproses.");
    }
  };

  const exportSubtitle = async (format: "srt" | "vtt") => {
    const response = await (format === "srt" ? subtitleSrt : subtitleVtt).refetch();
    if (!response.data) return toast.error("Subtitle belum tersedia.");
    downloadText(response.data.filename, response.data.content, format === "srt" ? "application/x-subrip" : "text/vtt");
  };

  const downloadVideo = async () => {
    const response = await videoDownload.refetch();
    if (!response.data) return toast.error("Tautan unduh video belum tersedia.");
    const anchor = document.createElement("a");
    anchor.href = response.data.url;
    anchor.download = response.data.filename;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    toast.success("Unduhan video dimulai.");
  };

  const queue8kConversion = () => {
    if (!selectedVideoId) return;
    request8k.mutate({ videoId: selectedVideoId });
  };

  const saveCue = async () => {
    if (!selectedVideoId || !editingCueId || !editingText.trim()) return toast.error("Teks subtitle tidak boleh kosong.");
    try {
      await persistSubtitleCorrection(
        () => updateCue.mutateAsync({ videoId: selectedVideoId, cueId: editingCueId, indonesianText: editingText.trim() }),
        () => refresh(selectedVideoId)
      );
      setEditingCueId(null);
      toast.success("Koreksi subtitle disimpan.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Koreksi subtitle belum tersimpan."); }
  };

  const exportSummary = async (format: "txt" | "pdf") => {
    let artifact;
    try {
      setSummaryBusy(true);
      artifact = await refetchLatestVideoSummaryExport(format, summary.refetch);
    } catch (error) {
      return toast.error(error instanceof Error ? error.message : "Ringkasan belum tersedia.");
    } finally {
      setSummaryBusy(false);
    }
    if (format === "txt") return downloadText(artifact.filename, artifact.content, artifact.mimeType);
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    pdf.setFont("helvetica", "normal");
    const lines = pdf.splitTextToSize(artifact.content, 174);
    let y = 18;
    lines.forEach((line: string) => { if (y > 280) { pdf.addPage(); y = 18; } pdf.text(line, 18, y); y += 6; });
    pdf.save(artifact.filename);
  };

  const changePreference = <K extends keyof VideoSubtitlePreferences>(key: K, value: VideoSubtitlePreferences[K]) => setPreferences(current => ({ ...current, [key]: value }));

  if (!open) return null;
  const selected = detail.data?.video;
  return <div className="fixed inset-0 z-50 bg-[#09251f]/55 p-4 backdrop-blur-sm sm:p-8" role="dialog" aria-modal="true" aria-label="Penerjemah video">
    <section className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-[1.5rem] border border-[#e8dcc1] bg-[#fffdf8] shadow-2xl">
      <header className="flex items-center justify-between border-b border-[#e8e1d3] px-5 py-4 sm:px-7"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#a98243]">Video ke Indonesia</p><h2 className="serif-display text-2xl font-semibold text-[#173a31]">Panel video & subtitle</h2></div><button onClick={onClose} aria-label="Tutup panel video" className="rounded-lg p-2 text-[#496158] hover:bg-[#f2eee4]"><X /></button></header>
      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[.82fr_1.18fr]">
        <aside className="overflow-y-auto border-b border-[#e8e1d3] bg-[#f8f5ed] p-5 lg:border-b-0 lg:border-r sm:p-7">
          <p className="text-sm font-semibold text-[#244b40]">Buat subtitle Indonesia</p><p className="mt-1 text-sm leading-6 text-[#6d7e74]">Unggah video atau gunakan URL media publik langsung. Tidak ada batas ukuran dari aplikasi; video besar tetap mengikuti kapasitas penyimpanan, jaringan, dan layanan transkripsi. Tautan DRM atau platform yang dibatasi tidak didukung.</p>
          <label className="mt-5 block text-xs font-bold uppercase tracking-[.1em] text-[#7a8b81]">Bahasa suara</label><select value={language} onChange={event => setLanguage(event.target.value as VideoLanguage)} disabled={isProcessing} className="mt-2 h-10 w-full rounded-lg border border-[#d8d2c2] bg-white px-3 text-sm text-[#284b40]"><option value="auto">Deteksi otomatis</option><option value="arabic">Arab</option><option value="english">Inggris</option><option value="malay">Melayu</option><option value="turkish">Turki</option><option value="french">Prancis</option><option value="german">Jerman</option><option value="spanish">Spanyol</option><option value="japanese">Jepang</option></select>
          <label aria-disabled={isProcessing} className={`mt-4 flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${isProcessing ? "cursor-not-allowed bg-[#4f7468] text-white/80" : "bg-[#1d5347] text-white hover:bg-[#16453a]"}`}><input ref={fileRef} onChange={event => handleFile(event.target.files?.[0])} type="file" className="sr-only" disabled={isProcessing} />{isProcessing ? <Loader2 className="animate-spin" /> : <UploadCloud />} Unggah atau lanjutkan video</label><p className="mt-2 text-center text-xs leading-5 text-[#718178]">Semua jenis berkas video dapat dipilih. Kelayakan akhir diperiksa saat video diproses; jika koneksi putus, pilih lagi berkas yang sama untuk melanjutkan.</p>
          {uploadNotice && <div className={`mt-3 rounded-xl border p-3 text-sm ${uploadNotice.tone === "success" ? "border-[#b9d9c9] bg-[#eef8f1] text-[#275a43]" : "border-[#c7dce8] bg-[#f0f8fc] text-[#28586f]"}`} role="status" aria-live="polite"><div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 shrink-0" size={17} /><div><p className="font-semibold">{uploadNotice.title}</p><p className="mt-0.5 text-xs leading-5 opacity-85">{uploadNotice.description}</p></div></div></div>}
          <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[.1em] text-[#9d9a8c]"><span className="h-px flex-1 bg-[#ddd7c9]" />atau URL publik<span className="h-px flex-1 bg-[#ddd7c9]" /></div><label className="text-xs font-bold uppercase tracking-[.1em] text-[#7a8b81]">Tautan media langsung</label><input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://contoh.com/video.mp4" disabled={isProcessing} className="mt-2 h-10 w-full rounded-lg border border-[#d8d2c2] bg-white px-3 text-sm outline-none focus:border-[#5b8578]" /><Button variant="outline" onClick={handlePublicUrl} disabled={isProcessing} className="mt-3 w-full border-[#cfc4a8] bg-white text-[#2b5548] hover:bg-[#f9f4e8]">{importUrl.isPending ? <Loader2 className="animate-spin" /> : <Link2 />} Impor video publik</Button>
          {isProcessing && <div className="mt-5 rounded-xl border border-[#d8c58d] bg-[#fff9e8] p-4 text-sm text-[#6f5a28]" role="status" aria-live="polite"><div className="flex items-start gap-2"><Loader2 className="mt-0.5 animate-spin" size={16} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><strong>{processingStatus.label}</strong><span className="text-xs font-bold tabular-nums">{processingPercent}%</span></div><p className="mt-1 leading-5">{processingStatus.hint}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eadfbd]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={processingPercent} aria-label="Progres pemrosesan video"><div className="h-full rounded-full bg-[#b7863e] transition-[width] duration-500" style={{ width: `${processingPercent}%` }} /></div><p className="mt-2 text-xs">Jangan tutup panel sampai subtitle Indonesia siap.</p></div></div></div>}
          {selected && <div className="mt-5 rounded-xl border p-3 text-sm"><p className="font-semibold">Konversi 8K</p><p className="mt-1 text-xs">{conversion8k.data ? `${conversion8k.data.status} · ${conversion8k.data.progressPercent}%` : "Siap diantrikan ke worker 8K."}</p><Button size="sm" onClick={queue8kConversion} disabled={request8k.isPending || conversion8k.data?.status === "queued" || conversion8k.data?.status === "processing"} className="mt-3">{request8k.isPending ? <Loader2 className="animate-spin" /> : <FileVideo />} {conversion8k.data?.status === "queued" || conversion8k.data?.status === "processing" ? "Dalam antrean 8K" : "Convert 8K"}</Button></div>}
          <div className="mt-7"><p className="mb-2 text-xs font-bold uppercase tracking-[.1em] text-[#7a8b81]">Riwayat video</p>{videos.isLoading ? <p className="text-sm text-[#7b8a81]">Memuat…</p> : <div className="space-y-2">{videos.data?.map(video => <button key={video.id} onClick={() => setSelectedVideoId(video.id)} className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedVideoId === video.id ? "border-[#bd9350] bg-[#fff8e8]" : "border-[#e3ddd0] bg-white hover:border-[#c9ba9c]"}`}><span className="flex items-center gap-2"><FileVideo size={16} className="text-[#a67636]" /><span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#28483e]">{video.title}</span></span><span className="mt-1 block text-xs text-[#77867c]">{video.translatedCount}/{video.cueCount} subtitle · {video.status}</span></button>)}{!videos.data?.length && <p className="text-sm text-[#7b8a81]">Belum ada video.</p>}</div>}</div>
          {selected && <div className="mt-7 rounded-xl border border-[#e0d5bf] bg-white p-4"><div className="flex items-center gap-2"><Palette size={16} className="text-[#a77a39]" /><p className="text-sm font-semibold text-[#284b40]">Tampilan subtitle</p></div><label className="mt-3 block text-xs font-semibold text-[#6d7f75]">Ukuran teks</label><div className="mt-2 grid grid-cols-4 gap-1">{[18, 22, 28, 34].map(size => <button key={size} onClick={() => changePreference("fontSize", size)} className={`rounded-md border px-1 py-2 text-xs font-bold ${preferences.fontSize === size ? "border-[#b98843] bg-[#fff4d9] text-[#78521e]" : "border-[#dfd8cb] text-[#63746b]"}`}>{size}px</button>)}</div><label className="mt-3 block text-xs font-semibold text-[#6d7f75]">Warna teks</label><div className="mt-2 flex gap-2">{["#ffffff", "#ffe69a", "#99f3cf", "#ffb0b0"].map(color => <button key={color} onClick={() => changePreference("color", color)} aria-label={`Warna ${color}`} className={`h-7 w-7 rounded-full border-2 ${preferences.color === color ? "border-[#1d5347]" : "border-white"}`} style={{ backgroundColor: color }} />)}</div><label className="mt-3 block text-xs font-semibold text-[#6d7f75]">Latar</label><select value={preferences.background} onChange={event => changePreference("background", event.target.value as VideoSubtitlePreferences["background"])} className="mt-1 h-9 w-full rounded-md border border-[#ded7ca] bg-white px-2 text-sm"><option value="dark">Gelap</option><option value="soft">Terang lembut</option><option value="transparent">Transparan</option></select><div className="mt-3 flex gap-2"><Button variant={preferences.weight === "bold" ? "default" : "outline"} size="sm" onClick={() => changePreference("weight", preferences.weight === "bold" ? "normal" : "bold")} className="flex-1">Tebal</Button><Button variant={preferences.italic ? "default" : "outline"} size="sm" onClick={() => changePreference("italic", !preferences.italic)} className="flex-1"><span className="italic">Miring</span></Button></div><p className="mt-3 rounded-md px-2 py-2 text-center leading-5" style={subtitleOverlayStyle(preferences)}>Contoh subtitle Indonesia</p></div>}
        </aside>
        <main className="min-h-0 overflow-y-auto p-5 sm:p-7">{!selectedVideoId ? <div className="grid h-full min-h-72 place-items-center rounded-2xl border border-dashed border-[#d9d0bd] bg-[#fbfaf5] text-center"><div><FileVideo className="mx-auto mb-3 text-[#bf9651]" size={34} /><p className="serif-display text-xl font-semibold text-[#27483e]">Pilih atau unggah video</p><p className="mt-2 max-w-sm text-sm leading-6 text-[#7b897f]">Subtitle Indonesia dan pemutar video akan muncul di sini setelah pemrosesan selesai.</p></div></div> : detail.isLoading ? <div className="grid h-full place-items-center"><Loader2 className="animate-spin text-[#2d6a59]" /></div> : selected ? <div><div className="relative"><video controls src={selected.videoUrl} onTimeUpdate={event => setPlaybackSeconds(event.currentTarget.currentTime)} onSeeked={event => setPlaybackSeconds(event.currentTarget.currentTime)} className="aspect-video w-full rounded-2xl bg-black shadow-lg">{vttUrl && <track key={vttUrl} kind="subtitles" srcLang="id" label="Indonesia" src={vttUrl} />}</video>{activeCueText && <div className="pointer-events-none absolute inset-x-4 bottom-14 text-center"><span className="inline-block max-w-[92%] rounded-lg px-3 py-2 leading-snug shadow-lg" style={subtitleOverlayStyle(preferences)}>{activeCueText}</span></div>}</div><div className="mt-5 flex flex-wrap items-start justify-between gap-3"><div><p className="serif-display text-2xl font-semibold text-[#1f4137]">{selected.title}</p><p className="mt-1 text-sm text-[#718178]">Status: <strong>{selected.status}</strong>{selected.errorMessage ? ` · ${selected.errorMessage}` : ""}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={downloadVideo} disabled={videoDownload.isFetching} className="border-[#d9c89d] bg-white text-[#704f20]">{videoDownload.isFetching ? <Loader2 className="animate-spin" /> : <Download />} Unduh video</Button><Button variant="outline" disabled={selected.status !== "translated"} onClick={() => exportSubtitle("srt")} className="border-[#d9c89d] bg-white text-[#704f20]"><Download /> SRT</Button><Button variant="outline" disabled={selected.status !== "translated"} onClick={() => exportSubtitle("vtt")} className="border-[#d9c89d] bg-white text-[#704f20]"><Download /> VTT</Button><Button variant="outline" disabled={selected.status !== "translated" || summaryBusy} onClick={() => exportSummary("txt")} className="border-[#d9c89d] bg-white text-[#704f20]">{summaryBusy ? <Loader2 className="animate-spin" /> : <FileText />} Ringkasan TXT</Button><Button variant="outline" disabled={selected.status !== "translated" || summaryBusy} onClick={() => exportSummary("pdf")} className="border-[#d9c89d] bg-white text-[#704f20]">{summaryBusy ? <Loader2 className="animate-spin" /> : <Download />} Ringkasan PDF</Button></div></div>{summaryBusy && <div className="mt-5 rounded-xl border border-[#c9ddd5] bg-[#f1f8f4] p-4 text-sm text-[#285b4b]" role="status" aria-live="polite"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 font-semibold"><Loader2 className="animate-spin" size={16} />{summaryStatus.label}</span><span className="text-xs font-bold tabular-nums">{summaryStatus.percent}%</span></div><p className="mt-1 text-xs leading-5 text-[#55766b]">{summaryStatus.hint}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#d9ebe3]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summaryStatus.percent} aria-label="Progres pembuatan ringkasan"><div className="h-full rounded-full bg-[#2d765f] transition-[width] duration-500" style={{ width: `${summaryStatus.percent}%` }} /></div></div>}
<div className="mt-5 divide-y divide-[#ece4d3] rounded-xl border border-[#e7dfcf]">{detail.data?.cues.map(cue => <div key={cue.id} className={`grid gap-2 px-4 py-3 transition-colors sm:grid-cols-[72px_1fr] ${activeCue === cue.id ? "bg-[#fff5d8]" : ""}`}><span className="text-xs font-bold text-[#a37a38]">{(cue.startMs / 1000).toFixed(1)}s</span><div><p className="text-sm text-[#4d6159]">{cue.sourceText}</p>{editingCueId === cue.id ? <div className="mt-2"><textarea value={editingText} onChange={event => setEditingText(event.target.value)} rows={3} className="w-full rounded-lg border border-[#bda56f] bg-[#fffdf8] p-2 text-sm text-[#173e34] outline-none focus:ring-2 focus:ring-[#e2c47c]" /><div className="mt-2 flex gap-2"><Button size="sm" onClick={saveCue} disabled={updateCue.isPending} className="bg-[#1d5347] text-white">{updateCue.isPending ? <Loader2 className="animate-spin" /> : <Save />} Simpan</Button><Button size="sm" variant="outline" onClick={() => setEditingCueId(null)}>Batal</Button></div></div> : <div className="mt-1 flex items-start gap-2"><p className="flex-1 text-sm font-medium text-[#173e34]">{cue.indonesianText ?? "Menerjemahkan…"}</p><button onClick={() => { setEditingCueId(cue.id); setEditingText(cue.indonesianText ?? ""); }} aria-label="Edit subtitle" className="rounded p-1 text-[#8a7546] hover:bg-[#f6eed9]"><Pencil size={15} /></button></div>}</div></div>)}{!detail.data?.cues.length && <p className="p-5 text-sm text-[#77867c]">Belum ada cue subtitle.</p>}</div></div> : null}</main>
      </div>
    </section>
  </div>;
}
