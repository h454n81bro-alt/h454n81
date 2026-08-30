import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { buildBilingualText } from "@/lib/bilingualExport";
import { translateUntilComplete, uploadAndTranslate } from "@/lib/translationProgress";
import { workspaceResetState } from "@/lib/workspaceReset";
import { GLOSSARY_LEGEND, persistGlossaryLegendPreference, readGlossaryLegendPreference, toggleGlossaryLegend } from "@/lib/glossaryLegend";
import { VideoTranslationPanel } from "@/components/VideoTranslationPanel";
import { VideoNotificationCenter } from "@/components/VideoNotificationCenter";
import { PublicVideoDownloadPanel } from "@/components/PublicVideoDownloadPanel";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  Bell,
  BookMarked,
  BookOpenText,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Film,
  FileUp,
  History,
  Languages,
  Link2,
  Loader2,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type SourceLanguage = "arabic" | "english" | "malay" | "turkish" | "french" | "german" | "spanish" | "japanese";

const SOURCE_LANGUAGE_OPTIONS: Array<{ value: SourceLanguage; label: string }> = [
  { value: "arabic", label: "Arab" },
  { value: "english", label: "Inggris" },
  { value: "malay", label: "Melayu" },
  { value: "turkish", label: "Turki" },
  { value: "french", label: "Prancis" },
  { value: "german", label: "Jerman" },
  { value: "spanish", label: "Spanyol" },
  { value: "japanese", label: "Jepang" },
];

function sourceLanguageLabel(value: SourceLanguage) {
  return SOURCE_LANGUAGE_OPTIONS.find(option => option.value === value)?.label ?? "Arab";
}

type DocumentRecord = {
  id: number;
  title: string;
  originalFileName: string;
  sourceLanguage: SourceLanguage;
  paragraphCount: number;
  translatedCount: number;
  status: "uploaded" | "translating" | "translated" | "failed";
  createdAt: Date;
  updatedAt: Date;
};

type GlossaryDraft = {
  arabicTerm: string;
  indonesianTerm: string;
  note: string;
};

type GlossaryItem = Omit<GlossaryDraft, "note"> & { id: number; note: string | null };

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] || character);
}

function statusLabel(status: DocumentRecord["status"]) {
  if (status === "translated") return "Selesai";
  if (status === "translating") return "Berjalan";
  if (status === "failed") return "Perlu ditinjau";
  return "Siap diterjemahkan";
}

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const utils = trpc.useUtils();
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isGlossaryOpen, setIsGlossaryOpen] = useState(false);
  const [isGlossaryLegendOpen, setIsGlossaryLegendOpen] = useState(true);
  const [hasLoadedLegendPreference, setHasLoadedLegendPreference] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "translating">("idle");
  const [sourceLanguage, setSourceLanguage] = useState<SourceLanguage>("arabic");
  const [isWorkspaceCleared, setIsWorkspaceCleared] = useState(false);
  const [isVideoPanelOpen, setIsVideoPanelOpen] = useState(false);
  const [isPublicVideoDownloadOpen, setIsPublicVideoDownloadOpen] = useState(false);
  const [isVideoNotificationsOpen, setIsVideoNotificationsOpen] = useState(false);
  const [focusedVideoId, setFocusedVideoId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const documentsQuery = trpc.documents.list.useQuery(undefined, { enabled: isAuthenticated });
  const glossaryQuery = trpc.glossary.list.useQuery(undefined, { enabled: isAuthenticated });
  const documentQuery = trpc.documents.get.useQuery(
    { documentId: selectedDocumentId ?? 0, page },
    { enabled: Boolean(selectedDocumentId) && isAuthenticated }
  );
  const prepareUploadMutation = trpc.documents.prepareUpload.useMutation();
  const finalizeUploadMutation = trpc.documents.finalizeUpload.useMutation();
  const translateMutation = trpc.documents.translateNext.useMutation();
  const markFailedMutation = trpc.documents.markFailed.useMutation();
  const createGlossaryMutation = trpc.glossary.create.useMutation();
  const updateGlossaryMutation = trpc.glossary.update.useMutation();
  const removeGlossaryMutation = trpc.glossary.remove.useMutation();
  const exportQuery = trpc.documents.exportData.useQuery(
    { documentId: selectedDocumentId ?? 0 },
    { enabled: false }
  );
  const videoNotifications = trpc.videos.notifications.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 15_000 });

  const selectedDocument = documentQuery.data?.document;
  const progress = selectedDocument
    ? Math.round((selectedDocument.translatedCount / Math.max(1, selectedDocument.paragraphCount)) * 100)
    : 0;

  useEffect(() => {
    const firstDocument = documentsQuery.data?.[0];
    if (!selectedDocumentId && firstDocument && !isWorkspaceCleared) setSelectedDocumentId(firstDocument.id);
  }, [documentsQuery.data, selectedDocumentId, isWorkspaceCleared]);

  useEffect(() => {
    setPage(0);
  }, [selectedDocumentId]);

  useEffect(() => {
    setIsGlossaryLegendOpen(readGlossaryLegendPreference(window.localStorage));
    setHasLoadedLegendPreference(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedLegendPreference) return;
    persistGlossaryLegendPreference(isGlossaryLegendOpen, window.localStorage);
  }, [hasLoadedLegendPreference, isGlossaryLegendOpen]);

  const refreshDocument = async () => {
    await Promise.all([utils.documents.list.invalidate(), utils.documents.get.invalidate()]);
  };

  const resetWorkspace = () => {
    const reset = workspaceResetState();
    setSelectedDocumentId(reset.selectedDocumentId);
    setPage(reset.page);
    setIsSidebarOpen(reset.isSidebarOpen);
    setIsWorkspaceCleared(reset.isWorkspaceCleared);
    toast.message("Ruang kerja dikosongkan. Riwayat kitab tetap tersimpan.");
  };

  const saveGlossaryTerm = async (term: GlossaryDraft, id?: number) => {
    try {
      if (id) {
        await updateGlossaryMutation.mutateAsync({ id, ...term });
        toast.success("Istilah glosarium diperbarui.");
      } else {
        await createGlossaryMutation.mutateAsync(term);
        toast.success("Istilah ditambahkan ke glosarium.");
      }
      await utils.glossary.list.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Istilah belum dapat disimpan.");
      throw error;
    }
  };

  const removeGlossaryTerm = async (id: number) => {
    try {
      await removeGlossaryMutation.mutateAsync({ id });
      await utils.glossary.list.invalidate();
      toast.success("Istilah dihapus dari glosarium.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Istilah belum dapat dihapus.");
    }
  };

  const handleFile = async (file?: File) => {
    if (!file || isUploading || isTranslating) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isEpub = file.type === "application/epub+zip" || file.name.toLowerCase().endsWith(".epub");
    const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || file.name.toLowerCase().endsWith(".docx");
    const isTxt = file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt");
    if (!isPdf && !isEpub && !isDocx && !isTxt) {
      toast.error("Gunakan dokumen PDF, EPUB, Word DOCX, atau TXT.");
      return;
    }
    setIsWorkspaceCleared(false);
    setIsUploading(true);
    setUploadPhase("uploading");
    try {
      const mimeType = isPdf
        ? "application/pdf"
        : isEpub
          ? "application/epub+zip"
          : isDocx
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "text/plain" as const;
      const result = await uploadAndTranslate({
        upload: async () => {
          const target = await prepareUploadMutation.mutateAsync({
            fileName: file.name,
            mimeType,
          });
          const uploadedResponse = await fetch(target.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: file });
          if (!uploadedResponse.ok) throw new Error("Layanan penyimpanan menolak unggahan ini. Periksa koneksi Anda atau coba lagi.");
          const uploaded = await finalizeUploadMutation.mutateAsync({ fileName: file.name, mimeType, sourceLanguage, storageKey: target.key });
          setIsWorkspaceCleared(false);
          setSelectedDocumentId(uploaded.documentId);
          await utils.documents.list.invalidate();
          setUploadPhase("translating");
          toast.success(`${uploaded.paragraphCount} bagian Arab ditemukan. Penerjemahan dimulai otomatis.`);
          return uploaded;
        },
        translate: document => translateDocument(document.documentId, document.paragraphCount, 0),
      });
      setIsWorkspaceCleared(false);
      setSelectedDocumentId(result.documentId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dokumen belum dapat diproses.");
    } finally {
      setIsUploading(false);
      setUploadPhase("idle");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const translateDocument = async (documentId: number, paragraphCount: number, initialCount: number) => {
    setIsTranslating(true);
    try {
      await translateUntilComplete({
        documentId,
        paragraphCount,
        initialCount,
        translateBatch: (id) => translateMutation.mutateAsync({ documentId: id }),
        refresh: refreshDocument,
      });
      toast.success("Penerjemahan dokumen telah selesai.");
    } catch (error) {
      await markFailedMutation.mutateAsync({ documentId }).catch(() => undefined);
      toast.error(error instanceof Error ? error.message : "Penerjemahan berhenti sebelum selesai.");
    } finally {
      setIsTranslating(false);
      await refreshDocument();
    }
  };

  const translateAll = async () => {
    if (!selectedDocumentId || !selectedDocument) return;
    await translateDocument(selectedDocumentId, selectedDocument.paragraphCount, selectedDocument.translatedCount);
  };

  const requestExport = async (format: "txt" | "pdf") => {
    if (!selectedDocumentId) return;
    try {
      const data = await exportQuery.refetch();
      if (!data.data) return;
      if (format === "txt") {
        const bilingualText = buildBilingualText(
          data.data.document.title,
          data.data.segments,
          data.data.document.sourceLanguage
        );
        const blob = new Blob([bilingualText], {
          type: "text/plain;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const anchor = window.document.createElement("a");
        anchor.href = url;
        anchor.download = `${data.data.document.title.replace(/[^\w-]+/g, "-")}-bilingual.txt`;
        anchor.click();
        URL.revokeObjectURL(url);
        toast.success("Berkas TXT bilingual berhasil dibuat.");
      } else {
        toast.message("Menyiapkan PDF bilingual…");
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
          import("html2canvas"),
          import("jspdf"),
        ]);
        await window.document.fonts?.ready;
        const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
        const exportData = data.data;
        const chunks = Array.from({ length: Math.ceil(exportData.segments.length / 7) }, (_, index) =>
          exportData.segments.slice(index * 7, index * 7 + 7)
        );
        for (let index = 0; index < chunks.length; index += 1) {
          const chunk = chunks[index] ?? [];
          const pageElement = window.document.createElement("section");
          pageElement.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;box-sizing:border-box;padding:50px 56px;background:#fffdf8;color:#17342d;font-family:'DM Sans',sans-serif;";
          pageElement.innerHTML = `
            <div style="border-bottom:1px solid #d9d1be;padding-bottom:14px;margin-bottom:22px;display:flex;justify-content:space-between;color:#587066;font-size:13px;">
              <strong>${escapeHtml(data.data.document.title)}</strong><span>Pustaka Terjemah · ${index + 1}</span>
            </div>
            ${chunk.map(segment => `
              <article style="break-inside:avoid;margin-bottom:24px;padding-bottom:20px;border-bottom:1px dashed #ddd5c3;">
                <div style="font-family:'Noto Naskh Arabic',serif;font-size:22px;line-height:2;text-align:right;direction:rtl;color:#173f35;">${escapeHtml(segment.arabicText)}</div>
                <div style="margin-top:10px;border-left:3px solid #d5b66d;background:#faf7ee;padding:12px 15px;font-size:14px;line-height:1.65;color:#42584f;">${escapeHtml(segment.indonesianText || "[Belum diterjemahkan]")}</div>
              </article>
            `).join("")}`;
          window.document.body.appendChild(pageElement);
          const canvas = await html2canvas(pageElement, { scale: 1.5, backgroundColor: "#fffdf8", useCORS: true });
          const imageHeight = (canvas.height * 190) / canvas.width;
          if (index > 0) pdf.addPage();
          pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 10, 10, 190, Math.min(imageHeight, 277), undefined, "FAST");
          pageElement.remove();
        }
        pdf.save(`${data.data.document.title.replace(/[^\w-]+/g, "-")}-bilingual.pdf`);
        toast.success("PDF bilingual berhasil diunduh.");
      }
    } catch {
      toast.error("Hasil ekspor belum dapat disiapkan.");
    }
  };

  if (loading) return <LoadingScreen />;
  if (!isAuthenticated) return <WelcomeScreen onLogin={() => startLogin()} />;

  return (
    <div className="min-h-screen bg-[#f8f6ef] text-[#17342d]">
      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-40 flex w-[288px] flex-col bg-[#113b33] px-5 py-6 text-[#f8f3e7] transition-transform duration-200 lg:translate-x-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="mb-9 flex items-center justify-between">
          <button onClick={() => setSelectedDocumentId(null)} className="flex items-center gap-3 text-left" aria-label="Beranda">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#d7b671] text-[#163a31] shadow-[0_8px_24px_rgba(0,0,0,.16)]"><BookOpenText size={21} /></span>
            <span><span className="block serif-display text-[21px] leading-5">Pustaka</span><span className="text-xs tracking-[0.17em] text-[#d8caa7]">TERJEMAH</span></span>
          </button>
          <button className="lg:hidden" onClick={() => setIsSidebarOpen(false)} aria-label="Tutup menu"><X size={20} /></button>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || isTranslating}
          className="mb-6 flex h-12 items-center justify-center gap-2 rounded-xl bg-[#e0c17f] px-4 text-sm font-bold text-[#17382f] shadow-[0_10px_24px_rgba(0,0,0,.16)] hover:bg-[#ebd397] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isUploading ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />} {isUploading ? "Memproses kitab…" : "Unggah Dokumen"}
        </button>
        <label className="mb-5 block rounded-xl border border-[#417166] bg-[#0d3129] px-3 py-2.5 text-xs text-[#d7e1dc]">
          <span className="mb-1.5 block font-semibold uppercase tracking-[0.1em] text-[#abc1b9]">Bahasa teks asli</span>
          <select value={sourceLanguage} onChange={event => setSourceLanguage(event.target.value as SourceLanguage)} disabled={isUploading || isTranslating} className="h-8 w-full rounded-md border border-[#5d877b] bg-[#17453b] px-2 text-sm font-medium text-white outline-none disabled:opacity-50">
            {SOURCE_LANGUAGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label} → Indonesia</option>)}
          </select>
        </label>
        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept=".pdf,.epub,.docx,.txt,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          onChange={(event: ChangeEvent<HTMLInputElement>) => handleFile(event.target.files?.[0])}
        />

        <div className="mb-3 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#abc1b9]"><History size={14} /> Riwayat Dokumen</div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {documentsQuery.isLoading && <SidebarDocumentSkeleton />}
          {documentsQuery.data?.map(document => (
            <button
              key={document.id}
              onClick={() => { setIsWorkspaceCleared(false); setSelectedDocumentId(document.id); setIsSidebarOpen(false); }}
              className={cn(
                "w-full rounded-xl px-3 py-3 text-left transition-colors",
                selectedDocumentId === document.id ? "bg-[#285b50] shadow-inner" : "hover:bg-[#1c4b42]"
              )}
            >
              <span className="flex items-start gap-2"><FileText size={16} className="mt-0.5 shrink-0 text-[#dfc279]" /><span className="min-w-0"><span className="block truncate text-sm font-medium">{document.title}</span><span className="mt-1 flex items-center justify-between text-xs text-[#aec4bd]"><span>{formatDate(document.updatedAt)}</span><span>{document.translatedCount}/{document.paragraphCount}</span></span></span></span>
            </button>
          ))}
          {!documentsQuery.isLoading && !documentsQuery.data?.length && <p className="px-2 py-4 text-sm leading-6 text-[#aec4bd]">Belum ada dokumen. Mulai dengan mengunggah kitab PDF atau EPUB.</p>}
        </div>

        <div className="mt-6 border-t border-[#417166] pt-5">
          <div className="flex items-center justify-between px-1"><div className="min-w-0"><p className="truncate text-sm font-semibold">{user?.name || "Pengguna"}</p><p className="truncate text-xs text-[#aec4bd]">Akun tersinkronisasi</p></div><button onClick={logout} title="Keluar" className="rounded-lg p-2 text-[#c4d3ce] hover:bg-[#285b50] hover:text-white"><LogOut size={17} /></button></div>
        </div>
      </aside>

      {isSidebarOpen && <button className="no-print fixed inset-0 z-30 bg-[#0d261f]/35 lg:hidden" onClick={() => setIsSidebarOpen(false)} aria-label="Tutup menu" />}

      <main className="min-h-screen lg:pl-[288px]">
        <header className="no-print sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-[#e3dfd1] bg-[#f8f6ef]/88 px-5 backdrop-blur-md sm:px-9">
          <div className="flex items-center gap-3"><button className="rounded-lg p-2 hover:bg-[#ece9dc] lg:hidden" onClick={() => setIsSidebarOpen(true)} aria-label="Buka menu"><Menu size={21} /></button><div><p className="text-xs font-bold uppercase tracking-[0.13em] text-[#7b8b81]">Ruang kerja</p><h1 className="serif-display text-xl font-semibold leading-6 sm:text-2xl">{selectedDocument?.title || "Terjemahkan naskah Anda"}</h1></div></div>
          <div className="flex items-center gap-2">
            {selectedDocument && <Badge className="hidden border-0 bg-[#e5f0e9] px-3 py-1.5 text-xs font-semibold text-[#2a6555] sm:inline-flex">{uploadPhase === "uploading" ? "Mengunggah & mengekstrak" : isTranslating ? "Menerjemahkan" : statusLabel(selectedDocument.status)}</Badge>}
            {selectedDocumentId && <Button variant="outline" size="sm" onClick={resetWorkspace} disabled={isUploading || isTranslating} className="border-[#d9d3c1] bg-white text-[#23483e] hover:bg-[#f4f1e7] disabled:opacity-50"><RefreshCw size={16} /><span className="hidden sm:inline">Refresh</span></Button>}
            <Button variant="outline" size="sm" onClick={() => setIsVideoNotificationsOpen(true)} className="relative border-[#d9d3c1] bg-white text-[#23483e] hover:bg-[#f4f1e7]"><Bell size={16} /><span className="hidden sm:inline">Aktivitas</span>{Boolean(videoNotifications.data?.unreadCount) && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#bd7735] px-1 text-[9px] font-bold text-white">{Math.min(videoNotifications.data?.unreadCount ?? 0, 9)}</span>}</Button>
            <Button variant="outline" size="sm" onClick={() => setIsPublicVideoDownloadOpen(true)} className="border-[#d9d3c1] bg-white text-[#23483e] hover:bg-[#f4f1e7]"><Link2 size={16} /><span className="hidden sm:inline">Link Video</span></Button>
            <Button variant="outline" size="sm" onClick={() => { setFocusedVideoId(null); setIsVideoPanelOpen(true); }} className="border-[#d9d3c1] bg-white text-[#23483e] hover:bg-[#f4f1e7]"><Film size={16} /><span className="hidden sm:inline">Video</span></Button>
            <Button variant="outline" size="sm" onClick={() => setIsGlossaryOpen(true)} className="border-[#d9d3c1] bg-white text-[#23483e] hover:bg-[#f4f1e7]"><BookMarked size={16} /><span className="hidden sm:inline">Glosarium</span></Button>
            <button onClick={() => fileInputRef.current?.click()} disabled={isUploading || isTranslating} className="grid h-10 w-10 place-items-center rounded-xl border border-[#ddd9ca] bg-white text-[#24493f] hover:border-[#b6ab8e] disabled:cursor-not-allowed disabled:opacity-50 sm:hidden" aria-label="Unggah dokumen"><FileUp size={18} /></button>
          </div>
        </header>

        <div className="mx-auto max-w-5xl px-4 py-7 sm:px-8 sm:py-10">
          {!selectedDocumentId ? <EmptyWorkspace disabled={isUploading || isTranslating} onUpload={() => fileInputRef.current?.click()} /> : <>
            <section className="no-print mb-7 rounded-2xl border border-[#e3dfd1] bg-[#fffdf8] p-5 shadow-[0_10px_35px_rgba(39,61,49,.05)] sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="mb-2 flex items-center gap-2"><Sparkles size={16} className="text-[#b99045]" /><p className="text-sm font-semibold">Penerjemahan {sourceLanguageLabel(selectedDocument?.sourceLanguage ?? "arabic")}–Indonesia</p></div><p className="text-sm text-[#718178]">{uploadPhase === "uploading" ? "File sedang diunggah dan teks asli sedang diekstrak…" : isTranslating ? "Kitab sedang diterjemahkan per batch. Anda dapat melihat progresnya di bawah." : "Terjemahan disusun berpasangan di bawah teks asli setiap bagian."}</p></div><div className="flex flex-wrap gap-2"><Button onClick={translateAll} disabled={isUploading || isTranslating || progress === 100} className="bg-[#1d5347] font-semibold text-white hover:bg-[#16453a]">{isTranslating ? <Loader2 className="animate-spin" /> : <Languages />} {isTranslating ? "Menerjemahkan…" : progress === 100 ? "Selesai diterjemahkan" : "Terjemahkan semua"}</Button><Button variant="outline" onClick={() => requestExport("txt")} className="border-[#d9d3c1] bg-white text-[#23483e] hover:bg-[#f4f1e7]"><ArrowDownToLine /> TXT</Button><Button variant="outline" onClick={() => requestExport("pdf")} className="border-[#d9d3c1] bg-white text-[#23483e] hover:bg-[#f4f1e7]"><Printer /> PDF</Button></div></div>
              <div className="mt-5 flex items-center gap-3"><Progress value={progress} className="h-2 bg-[#ebe7da] [&>div]:bg-[#bf9350]" /><span className="shrink-0 text-xs font-semibold text-[#66786e]">{selectedDocument?.translatedCount ?? 0}/{selectedDocument?.paragraphCount ?? 0}</span></div>
            </section>

            <section className="print-document paper-texture overflow-hidden rounded-[1.25rem] border border-[#e1dccd] bg-[#fffdf8] shadow-[0_18px_45px_rgba(34,54,43,.07)]">
              <div className="no-print flex items-center justify-between border-b border-[#ece7d9] bg-[#fbfaf5] px-5 py-4 sm:px-8"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#f1e5c8] text-[#90652b]"><BookOpenText size={15} /></span><span><span className="block text-sm font-bold">Naskah bilingual</span><span className="text-xs text-[#78887e]">{sourceLanguageLabel(selectedDocument?.sourceLanguage ?? "arabic")} di atas, Indonesia di bawah</span></span></div><div className="flex items-center gap-2"><button type="button" aria-expanded={isGlossaryLegendOpen} aria-controls="glossary-legend" onClick={() => setIsGlossaryLegendOpen(toggleGlossaryLegend)} className="inline-flex items-center gap-1.5 rounded-full border border-[#dfcca0] bg-[#fffdf7] px-3 py-1.5 text-xs font-semibold text-[#765e31] hover:bg-[#f8efd5]"><BookMarked size={14} /> {isGlossaryLegendOpen ? "Sembunyikan legenda" : "Legenda sorotan"}</button><span className="rounded-full border border-[#e1d8bf] bg-[#fffdf7] px-3 py-1 text-xs font-semibold text-[#826633]">Hal. {page + 1}</span></div></div>
              {isGlossaryLegendOpen && <aside id="glossary-legend" className="no-print mx-5 mt-5 rounded-xl border border-[#e2cf99] bg-[#fffbec] px-4 py-3 sm:mx-8" aria-label={GLOSSARY_LEGEND.title}><div className="flex items-start gap-3"><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#e8f1ea] text-[#32614f]"><BookMarked size={14} /></span><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.1em] text-[#806631]">{GLOSSARY_LEGEND.title}</p><p className="mt-1 text-xs leading-5 text-[#5c6b62]">{GLOSSARY_LEGEND.description}</p><div className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-[#4c655b]"><mark className="rounded bg-[#ecd68d]/70 px-1 font-semibold text-[#315346] decoration-[#b88e38] underline decoration-2 underline-offset-2">{GLOSSARY_LEGEND.label}</mark><span>menandakan padanan wajib telah digunakan.</span></div></div></div></aside>}
              <div className="p-5 sm:p-9">
                {documentQuery.isLoading ? <ReaderSkeleton /> : documentQuery.data?.segments.map((segment, index) => <TranslationPair key={segment.id} number={segment.position} sourceText={segment.arabicText} sourceLanguage={selectedDocument?.sourceLanguage ?? "arabic"} indonesian={segment.indonesianText} glossaryMatches={segment.glossaryMatches} showDivider={index < documentQuery.data.segments.length - 1} />)}
                {!documentQuery.isLoading && !documentQuery.data?.segments.length && <p className="py-12 text-center text-sm text-[#6b7b72]">Bagian dokumen belum tersedia.</p>}
              </div>
              {documentQuery.data && documentQuery.data.pageCount > 1 && <div className="no-print flex items-center justify-between border-t border-[#ece7d9] bg-[#fbfaf5] px-5 py-4 sm:px-8"><Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(value => value - 1)}><ChevronLeft /> Sebelumnya</Button><span className="text-xs font-semibold text-[#61756b]">Halaman {page + 1} dari {documentQuery.data.pageCount}</span><Button variant="ghost" size="sm" disabled={page >= documentQuery.data.pageCount - 1} onClick={() => setPage(value => value + 1)}>Berikutnya <ChevronRight /></Button></div>}
            </section>
          </>}
        </div>
      </main>
      <VideoTranslationPanel open={isVideoPanelOpen} focusVideoId={focusedVideoId} onClose={() => setIsVideoPanelOpen(false)} />
      <PublicVideoDownloadPanel open={isPublicVideoDownloadOpen} onClose={() => setIsPublicVideoDownloadOpen(false)} onImported={videoId => { setFocusedVideoId(videoId); setIsPublicVideoDownloadOpen(false); setIsVideoPanelOpen(true); }} />
      <VideoNotificationCenter open={isVideoNotificationsOpen} onClose={() => setIsVideoNotificationsOpen(false)} onOpenVideo={videoId => { setFocusedVideoId(videoId); setIsVideoNotificationsOpen(false); setIsVideoPanelOpen(true); }} />
      {isGlossaryOpen && <GlossaryModal terms={glossaryQuery.data ?? []} loading={glossaryQuery.isLoading} onClose={() => setIsGlossaryOpen(false)} onSave={saveGlossaryTerm} onRemove={removeGlossaryTerm} />}
    </div>
  );
}

function GlossaryModal({ terms, loading, onClose, onSave, onRemove }: { terms: GlossaryItem[]; loading: boolean; onClose: () => void; onSave: (term: GlossaryDraft, id?: number) => Promise<void>; onRemove: (id: number) => Promise<void> }) {
  const [draft, setDraft] = useState<GlossaryDraft>({ arabicTerm: "", indonesianTerm: "", note: "" });
  const [editingId, setEditingId] = useState<number>();
  const [isSaving, setIsSaving] = useState(false);

  const reset = () => {
    setDraft({ arabicTerm: "", indonesianTerm: "", note: "" });
    setEditingId(undefined);
  };

  const edit = (term: GlossaryItem) => {
    setDraft({ arabicTerm: term.arabicTerm, indonesianTerm: term.indonesianTerm, note: term.note || "" });
    setEditingId(term.id);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      await onSave(draft, editingId);
      reset();
    } catch {
      // Notifikasi kegagalan sudah disampaikan oleh pemanggil.
    } finally {
      setIsSaving(false);
    }
  };

  return <div className="no-print fixed inset-0 z-50 flex items-end bg-[#0c2821]/45 p-0 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="glossary-title"><div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[1.5rem] bg-[#fffdf8] shadow-[0_25px_80px_rgba(10,35,28,.3)] sm:max-h-[86vh] sm:rounded-[1.5rem]"><div className="flex items-start justify-between border-b border-[#e8e2d3] bg-[#fbf8ef] px-6 py-5"><div><div className="mb-1 flex items-center gap-2 text-[#a67a35]"><BookMarked size={17} /><span className="text-xs font-bold uppercase tracking-[0.14em]">Konsistensi terjemahan</span></div><h2 id="glossary-title" className="serif-display text-2xl font-semibold text-[#1a4036]">Glosarium istilah</h2><p className="mt-1 text-sm text-[#73837a]">Padanan ini diterapkan pada penerjemahan semua buku Anda.</p></div><button onClick={onClose} className="rounded-lg p-2 text-[#61756b] hover:bg-[#ece7d9]" aria-label="Tutup glosarium"><X size={20} /></button></div><div className="grid min-h-0 flex-1 lg:grid-cols-[.92fr_1.08fr]"><form onSubmit={submit} className="border-b border-[#e8e2d3] bg-[#fdfbf5] p-6 lg:border-b-0 lg:border-r"><div className="mb-5 flex items-center justify-between"><p className="text-sm font-bold text-[#2a5045]">{editingId ? "Ubah istilah" : "Tambah istilah"}</p>{editingId && <button type="button" onClick={reset} className="text-xs font-semibold text-[#836331] hover:underline">Batal ubah</button>}</div><label className="mb-4 block text-sm font-medium text-[#41584f]">Istilah Arab<input required value={draft.arabicTerm} onChange={event => setDraft(value => ({ ...value, arabicTerm: event.target.value }))} dir="rtl" placeholder="contoh: زكاة" className="mt-1.5 h-11 w-full rounded-xl border border-[#dcd5c3] bg-white px-3 text-right font-['Noto_Naskh_Arabic'] text-lg text-[#173e34] outline-none ring-[#c19a54] placeholder:text-[#aeb7af] focus:ring-2" /></label><label className="mb-4 block text-sm font-medium text-[#41584f]">Padanan Indonesia<input required value={draft.indonesianTerm} onChange={event => setDraft(value => ({ ...value, indonesianTerm: event.target.value }))} placeholder="contoh: zakat" className="mt-1.5 h-11 w-full rounded-xl border border-[#dcd5c3] bg-white px-3 text-[#173e34] outline-none ring-[#c19a54] placeholder:text-[#aeb7af] focus:ring-2" /></label><label className="block text-sm font-medium text-[#41584f]">Catatan <span className="font-normal text-[#829088]">opsional</span><textarea value={draft.note} onChange={event => setDraft(value => ({ ...value, note: event.target.value }))} placeholder="Kapan atau bagaimana istilah digunakan." rows={3} className="mt-1.5 w-full resize-none rounded-xl border border-[#dcd5c3] bg-white px-3 py-2 text-sm leading-6 text-[#173e34] outline-none ring-[#c19a54] placeholder:text-[#aeb7af] focus:ring-2" /></label><Button type="submit" disabled={isSaving} className="mt-5 w-full bg-[#1d5347] font-semibold text-white hover:bg-[#16453a]">{isSaving ? <Loader2 className="animate-spin" /> : editingId ? <Pencil /> : <Plus />} {editingId ? "Simpan perubahan" : "Tambahkan istilah"}</Button></form><div className="min-h-0 overflow-y-auto p-6"><div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold text-[#2a5045]">Istilah aktif</p><Badge className="border-0 bg-[#efe7d4] text-[#88672f]">{terms.length} istilah</Badge></div>{loading ? <div className="space-y-3"><Skeleton className="h-20 w-full bg-[#eee9dc]" /><Skeleton className="h-20 w-full bg-[#eee9dc]" /></div> : terms.length ? <div className="space-y-3">{terms.map(term => <div key={term.id} className="rounded-xl border border-[#e4dece] bg-white p-4 shadow-[0_4px_15px_rgba(31,59,48,.035)]"><div className="flex gap-3"><div className="min-w-0 flex-1"><p dir="rtl" className="font-['Noto_Naskh_Arabic'] text-right text-xl leading-7 text-[#1c463a]">{term.arabicTerm}</p><p className="mt-1 text-sm font-semibold text-[#557065]">{term.indonesianTerm}</p>{term.note && <p className="mt-1.5 text-xs leading-5 text-[#85928b]">{term.note}</p>}</div><div className="flex shrink-0 items-start gap-1"><button type="button" onClick={() => edit(term)} className="rounded-lg p-2 text-[#567269] hover:bg-[#edf3ef]" aria-label={`Ubah ${term.arabicTerm}`}><Pencil size={15} /></button><button type="button" onClick={() => onRemove(term.id)} className="rounded-lg p-2 text-[#a1574d] hover:bg-[#f9ece9]" aria-label={`Hapus ${term.arabicTerm}`}><Trash2 size={15} /></button></div></div></div>)}</div> : <div className="rounded-xl border border-dashed border-[#d9d1be] bg-[#fbf8ef] px-5 py-9 text-center"><BookMarked className="mx-auto mb-3 text-[#bc9851]" size={24} /><p className="text-sm font-semibold text-[#4d675d]">Glosarium masih kosong</p><p className="mt-1 text-xs leading-5 text-[#819088]">Tambahkan istilah yang ingin diterjemahkan dengan padanan yang konsisten.</p></div>}</div></div><div className="border-t border-[#e8e2d3] bg-[#fbf8ef] px-6 py-3 text-xs leading-5 text-[#75857b]">Glosarium diterapkan ketika Anda menjalankan penerjemahan. Bagian yang telah diterjemahkan sebelumnya tidak diubah otomatis.</div></div></div>;
}

type AppliedGlossaryMatchView = {
  glossaryTermId: number;
  arabicTerm: string;
  indonesianTerm: string;
  note: string | null;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedTranslation({ text, matches }: { text: string; matches: AppliedGlossaryMatchView[] }) {
  const uniqueMatches = Array.from(
    new Map(matches.map(match => [match.indonesianTerm.toLocaleLowerCase("id-ID"), match])).values()
  ).sort((left, right) => right.indonesianTerm.length - left.indonesianTerm.length);
  if (!uniqueMatches.length) return <>{text}</>;
  const expression = new RegExp(`(${uniqueMatches.map(match => escapeRegExp(match.indonesianTerm)).join("|")})`, "gi");
  return <>{text.split(expression).map((part, index) => {
    const matched = uniqueMatches.find(match => match.indonesianTerm.toLocaleLowerCase("id-ID") === part.toLocaleLowerCase("id-ID"));
    return matched ? <mark key={`${matched.glossaryTermId}-${index}`} title={`Glosarium: ${matched.arabicTerm} → ${matched.indonesianTerm}`} className="rounded bg-[#ecd68d]/70 px-0.5 font-semibold text-[#315346] decoration-[#b88e38] underline decoration-2 underline-offset-2">{part}</mark> : <span key={index}>{part}</span>;
  })}</>;
}

function TranslationPair({ number, sourceText, sourceLanguage, indonesian, glossaryMatches, showDivider }: { number: number; sourceText: string; sourceLanguage: SourceLanguage; indonesian: string | null; glossaryMatches: AppliedGlossaryMatchView[]; showDivider: boolean }) {
  return <article className="translation-pair"><div className="mb-4 flex items-start gap-3"><span className="mt-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#e9e4d6] px-1 text-[10px] font-bold text-[#77837a]">{number}</span><p dir={sourceLanguage === "arabic" ? "rtl" : "ltr"} className={cn("min-w-0 flex-1 text-[#193d34]", sourceLanguage === "arabic" ? "arabic-text" : "text-[17px] leading-8")}>{sourceText}</p></div><div className="ml-9 rounded-r-xl border-l-[3px] border-[#d6b76f] bg-[#faf7ee] px-5 py-4"><p className={cn("text-[15px] leading-7 text-[#42584f]", !indonesian && "italic text-[#909c95]")}>{indonesian ? <HighlightedTranslation text={indonesian} matches={glossaryMatches} /> : "Terjemahan akan tampil di sini setelah proses dimulai."}</p>{glossaryMatches.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#eadfbf] pt-3"><span className="inline-flex items-center gap-1 rounded-full bg-[#e8f1ea] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#32614f]"><BookMarked size={12} /> Glosarium diterapkan</span>{glossaryMatches.map(match => <span key={match.glossaryTermId} className="inline-flex items-center gap-1 rounded-full border border-[#dfcca0] bg-[#fffcf2] px-2.5 py-1 text-xs text-[#766039]" title={match.note || undefined}><span dir="rtl" className="font-['Noto_Naskh_Arabic'] text-sm leading-none text-[#315445]">{match.arabicTerm}</span><span className="text-[#bc9653]">→</span><span className="font-semibold">{match.indonesianTerm}</span></span>)}</div>}</div>{showDivider && <div className="mx-9 my-7 border-b border-dashed border-[#e3dece]" />}</article>;
}

function EmptyWorkspace({ onUpload, disabled }: { onUpload: () => void; disabled: boolean }) {
  return <section className="paper-texture overflow-hidden rounded-[1.5rem] border border-[#e1dccd] bg-[#fffdf8] px-6 py-16 text-center shadow-[0_18px_45px_rgba(34,54,43,.07)] sm:px-14 sm:py-24"><span className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-[#e5f0e9] text-[#20604e] shadow-[0_10px_25px_rgba(31,89,73,.12)]"><Languages size={31} /></span><p className="mb-2 text-xs font-bold uppercase tracking-[0.17em] text-[#a98445]">Penerjemah naskah</p><h2 className="serif-display mx-auto max-w-xl text-3xl font-semibold leading-tight text-[#193c33] sm:text-4xl">Teks sumber, dibaca berdampingan dengan maknanya.</h2><p className="mx-auto mt-5 max-w-md text-sm leading-7 text-[#687b71]">Unggah dokumen PDF, EPUB, Word DOCX, atau TXT untuk mengurai teks sumber dan menempatkan terjemahan Indonesia tepat di bawah setiap bagian.</p><Button size="lg" disabled={disabled} onClick={onUpload} className="mt-8 bg-[#1d5347] px-6 font-semibold text-white hover:bg-[#16453a] disabled:cursor-not-allowed disabled:opacity-60">{disabled ? <Loader2 className="animate-spin" /> : <UploadCloud />} {disabled ? "Memproses dokumen…" : "Pilih dokumen"}</Button><p className="mt-4 text-xs text-[#87948d]">PDF · EPUB · Word DOCX · TXT · Ukuran mengikuti kapasitas layanan</p></section>;
}

function WelcomeScreen({ onLogin }: { onLogin: () => void }) {
  return <main className="paper-texture min-h-screen bg-[#f8f6ef] px-5 py-8 sm:p-12"><div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-[#e0dac9] bg-[#fffdf8] shadow-[0_30px_80px_rgba(31,64,54,.12)] lg:grid lg:grid-cols-[1.08fr_.92fr]"><section className="bg-[#123b33] px-8 py-12 text-[#f8f3e7] sm:px-14 sm:py-16"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#d7b671] text-[#163a31]"><BookOpenText size={23} /></span><span><span className="block serif-display text-2xl leading-5">Pustaka</span><span className="text-xs tracking-[0.18em] text-[#d8caa7]">TERJEMAH</span></span></div><div className="mt-24 max-w-md"><p className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-[#d9bf7e]">Arab · Indonesia</p><h1 className="serif-display text-4xl font-semibold leading-[1.13] sm:text-5xl">Terjemahkan buku Arab dengan konteks yang tetap terjaga.</h1><p className="mt-6 text-[15px] leading-7 text-[#c5d3ce]">Satu ruang baca untuk mengunggah naskah, menerjemahkan per bagian, dan menyimpan riwayat kerja Anda secara pribadi.</p></div><div className="mt-16 border-t border-[#407064] pt-6"><p dir="rtl" className="arabic-text text-right text-[1.35rem] text-[#e5d8b8]">وَقُل رَّبِّ زِدْنِي عِلْمًا</p><p className="mt-2 text-sm text-[#aabdb6]">“Ya Tuhanku, tambahkanlah kepadaku ilmu.”</p></div></section><section className="flex flex-col justify-center px-8 py-14 sm:px-14"><Badge className="mb-6 w-fit border-0 bg-[#e5f0e9] px-3 py-1.5 text-xs font-semibold text-[#2b6555]"><Check size={14} className="mr-1" /> Ruang kerja pribadi</Badge><h2 className="serif-display text-3xl font-semibold text-[#173a31]">Masuk untuk mulai menerjemahkan.</h2><p className="mt-4 max-w-sm text-sm leading-7 text-[#6a7c73]">Riwayat dokumen dan hasil terjemahan Anda akan tersimpan aman pada akun sendiri.</p><Button onClick={onLogin} size="lg" className="mt-9 w-full bg-[#1d5347] font-semibold text-white hover:bg-[#16453a]">Masuk ke Pustaka <ChevronRight /></Button><div className="mt-8 grid grid-cols-3 gap-3 text-center text-xs text-[#697b72]"><div><Languages className="mx-auto mb-2 text-[#b4853e]" size={18} />Terjemahan</div><div><History className="mx-auto mb-2 text-[#b4853e]" size={18} />Riwayat</div><div><Printer className="mx-auto mb-2 text-[#b4853e]" size={18} />Ekspor</div></div></section></div></main>;
}

function LoadingScreen() { return <div className="min-h-screen bg-[#f8f6ef] p-8"><div className="mx-auto max-w-5xl space-y-5"><Skeleton className="h-16 w-full bg-[#eae6d9]" /><Skeleton className="h-[480px] w-full bg-[#eeeade]" /></div></div>; }
function SidebarDocumentSkeleton() { return <><Skeleton className="h-16 w-full bg-[#2a5a50]" /><Skeleton className="h-16 w-full bg-[#2a5a50]" /></>; }
function ReaderSkeleton() { return <div className="space-y-9"><Skeleton className="ml-auto h-28 w-4/5 bg-[#eeeadd]" /><Skeleton className="h-20 w-4/5 bg-[#f2eee3]" /><Skeleton className="ml-auto h-28 w-3/4 bg-[#eeeadd]" /><Skeleton className="h-20 w-4/5 bg-[#f2eee3]" /></div>; }
