import { Button } from "@/components/ui/button";
import { publicVideoDownloadState, publicVideoLinkGuidance, validatePublicVideoLink } from "@/lib/publicVideoLink";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Download, Link2, Loader2, X } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";

const LANGUAGES = [
  ["auto", "Deteksi otomatis"],
  ["arabic", "Arab"],
  ["english", "Inggris"],
  ["malay", "Melayu"],
  ["turkish", "Turki"],
  ["french", "Prancis"],
  ["german", "Jerman"],
  ["spanish", "Spanyol"],
  ["japanese", "Jepang"],
] as const;

type PublicVideoDownloadPanelProps = {
  open: boolean;
  onClose: () => void;
  onImported: (videoId: number) => void;
};

export function PublicVideoDownloadPanel({ open, onClose, onImported }: PublicVideoDownloadPanelProps) {
  const utils = trpc.useUtils();
  const [url, setUrl] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState<(typeof LANGUAGES)[number][0]>("auto");
  const [linkGuidance, setLinkGuidance] = useState<string | null>(null);
  const [sourcePageUrl, setSourcePageUrl] = useState<string | null>(null);
  const importVideo = trpc.videos.importPublicUrl.useMutation({
    onSuccess: async result => {
      if (!("videoId" in result) || typeof result.videoId !== "number") {
        setLinkGuidance(result.guidance ?? "Tautan ini adalah halaman publik. Buka sumbernya untuk memakai unduhan resmi, lalu unggah file video.");
        setSourcePageUrl(result.sourcePageUrl ?? url.trim());
        return;
      }
      await utils.videos.list.invalidate();
      toast.success("Video publik tersimpan dan mulai diproses.");
      setUrl("");
      setLinkGuidance(null);
      setSourcePageUrl(null);
      onImported(result.videoId);
      onClose();
    },
    onError: error => {
      const guidance = publicVideoLinkGuidance(error.message);
      if (guidance) {
        setLinkGuidance(guidance);
        setSourcePageUrl(url.trim());
      }
      else toast.error(error.message || "Tautan video belum dapat diunduh.");
    },
  });

  if (!open) return null;
  const downloadState = publicVideoDownloadState(url, importVideo.isPending);
  const submit = () => {
    const validationError = downloadState.validationError;
    if (validationError) return toast.error(validationError);
    importVideo.mutate({ url: url.trim(), sourceLanguage });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#09251f]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Unduh video dari tautan">
      <section className="w-full max-w-lg rounded-3xl border border-[#e6d8bb] bg-[#fffdf8] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[#a98243]">Video publik</p>
            <h2 className="serif-display mt-1 text-2xl font-semibold text-[#173a31]">Unduh dari Link Video</h2>
          </div>
          <button onClick={onClose} aria-label="Tutup panel unduh video" className="rounded-lg p-2 text-[#536b62] hover:bg-[#f3eee4]"><X /></button>
        </div>
        <p className="mt-3 text-sm leading-6 text-[#60756b]">Masukkan tautan langsung ke file video publik. Video akan disimpan ke riwayat Anda, lalu ditranskripsikan dan diterjemahkan ke bahasa Indonesia.</p>
        <label className="mt-5 block text-xs font-bold uppercase tracking-[.1em] text-[#61776d]">Tautan video publik</label>
        <input value={url} onChange={event => { setUrl(event.target.value); setLinkGuidance(null); setSourcePageUrl(null); }} placeholder="https://contoh.com/video.mp4" disabled={importVideo.isPending} className="mt-2 h-11 w-full rounded-xl border border-[#d9d0be] bg-white px-3 text-sm outline-none focus:border-[#3f7565]" />
        {linkGuidance ? <div role="alert" className="mt-3 rounded-xl border border-[#b9d8cc] bg-[#eff8f3] p-3 text-sm leading-5 text-[#245d4e]"><p>{linkGuidance}</p>{sourcePageUrl ? <a href={sourcePageUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-semibold underline underline-offset-4">Buka halaman sumber <Link2 size={14} /></a> : null}</div> : null}
        <label className="mt-4 block text-xs font-bold uppercase tracking-[.1em] text-[#61776d]">Bahasa suara</label>
        <select value={sourceLanguage} onChange={event => setSourceLanguage(event.target.value as typeof sourceLanguage)} disabled={importVideo.isPending} className="mt-2 h-11 w-full rounded-xl border border-[#d9d0be] bg-white px-3 text-sm">
          {LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <div className="mt-5 flex gap-3 rounded-xl border border-[#ecd59d] bg-[#fff8e8] p-3 text-xs leading-5 text-[#755a21]"><AlertTriangle className="mt-0.5 shrink-0" size={16} /><p>Hanya tautan media publik langsung yang didukung. DRM, paywall, situs yang membatasi unduhan, dan URL internal akan ditolak.</p></div>
        <Button onClick={submit} disabled={!downloadState.canSubmit} className="mt-5 w-full bg-[#1f6553] text-white hover:bg-[#195444]">
          {importVideo.isPending ? <Loader2 className="animate-spin" /> : <Download />} {downloadState.buttonLabel}
        </Button>
      </section>
    </div>
  );
}
