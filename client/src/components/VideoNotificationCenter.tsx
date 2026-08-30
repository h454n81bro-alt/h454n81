import { trpc } from "@/lib/trpc";
import { filterVideoNotifications, type VideoNotificationFilterKind } from "@/lib/videoNotificationFilters";
import { Bell, CheckCircle2, CircleAlert, Clock3, Loader2, Video, X } from "lucide-react";
import { useMemo, useState } from "react";

type Props = { open: boolean; onClose: () => void; onOpenVideo: (videoId: number) => void };

const styles = {
  processing: { icon: Clock3, className: "bg-[#edf7fb] text-[#286178]", label: "Sedang diproses" },
  translated: { icon: CheckCircle2, className: "bg-[#eef8f1] text-[#27704b]", label: "Selesai" },
  failed: { icon: CircleAlert, className: "bg-[#fff0ef] text-[#a54439]", label: "Gagal" },
  uploaded: { icon: Video, className: "bg-[#fff6df] text-[#976c28]", label: "Diunggah" },
} as const;

export function VideoNotificationCenter({ open, onClose, onOpenVideo }: Props) {
  const utils = trpc.useUtils();
  const feed = trpc.videos.notifications.useQuery(undefined, { enabled: open, refetchInterval: open ? 12_000 : false });
  const markRead = trpc.videos.markNotificationRead.useMutation({ onSuccess: () => utils.videos.notifications.invalidate() });
  const [statusFilter, setStatusFilter] = useState<VideoNotificationFilterKind>("all");
  const [query, setQuery] = useState("");
  const visibleNotifications = useMemo(() => filterVideoNotifications(feed.data?.notifications ?? [], statusFilter, query), [feed.data?.notifications, query, statusFilter]);
  if (!open) return null;

  return <div className="fixed inset-0 z-[55] bg-[#09251f]/55 p-4 backdrop-blur-sm sm:p-8" role="dialog" aria-modal="true" aria-label="Pusat notifikasi video">
    <section className="mx-auto flex h-full max-w-2xl flex-col overflow-hidden rounded-[1.5rem] border border-[#e8dcc1] bg-[#fffdf8] shadow-2xl">
      <header className="flex items-center justify-between border-b border-[#e8e1d3] px-5 py-4 sm:px-7"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#a98243]">Riwayat unggahan</p><h2 className="serif-display text-2xl font-semibold text-[#173a31]">Pusat notifikasi video</h2><p className="mt-1 text-sm text-[#718178]">{feed.data?.unreadCount ?? 0} notifikasi belum dibaca</p></div><button onClick={onClose} aria-label="Tutup pusat notifikasi" className="rounded-lg p-2 text-[#496158] hover:bg-[#f2eee4]"><X /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">{feed.isLoading ? <div className="grid h-40 place-items-center"><Loader2 className="animate-spin text-[#2d6a59]" /></div> : !feed.data?.notifications.length ? <div className="grid h-48 place-items-center rounded-2xl border border-dashed border-[#d9d0bd] bg-[#fbfaf5] text-center"><div><Bell className="mx-auto mb-3 text-[#bf9651]" size={30} /><p className="font-semibold text-[#27483e]">Belum ada riwayat video</p><p className="mt-1 text-sm text-[#77867c]">Status unggahan dan pemrosesan video akan muncul di sini.</p></div></div> : <><div className="mb-5 grid gap-3 sm:grid-cols-[1fr_170px]"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari judul atau status video…" className="h-11 rounded-xl border border-[#dcd5c3] bg-white px-3 text-sm text-[#23483e] outline-none ring-[#c19a54] placeholder:text-[#9aa69f] focus:ring-2" aria-label="Cari riwayat video" /><select value={statusFilter} onChange={event => setStatusFilter(event.target.value as VideoNotificationFilterKind)} className="h-11 rounded-xl border border-[#dcd5c3] bg-white px-3 text-sm font-medium text-[#355a4e] outline-none ring-[#c19a54] focus:ring-2" aria-label="Filter status video"><option value="all">Semua status</option><option value="uploaded">Diunggah</option><option value="processing">Diproses</option><option value="translated">Selesai</option><option value="failed">Gagal</option></select></div>{!visibleNotifications.length ? <div className="grid h-36 place-items-center rounded-2xl border border-dashed border-[#d9d0bd] bg-[#fbfaf5] text-center"><p className="text-sm text-[#718178]">Tidak ada riwayat yang sesuai dengan pencarian atau filter Anda.</p></div> : <div className="space-y-3">{visibleNotifications.map(item => { const config = styles[item.kind]; const Icon = config.icon; return <button key={item.id} onClick={() => { if (!item.readAt) markRead.mutate({ notificationId: item.id }); if (item.videoId) onOpenVideo(item.videoId); }} className={`w-full rounded-2xl border p-4 text-left transition-colors ${item.readAt ? "border-[#e5dfd2] bg-white" : "border-[#bcd7ca] bg-[#f2faf5]"}`}><div className="flex gap-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${config.className}`}><Icon size={18} /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-x-2 gap-y-1"><strong className="text-sm text-[#25483e]">{item.title}</strong><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#6b7e74]">{config.label}</span>{!item.readAt && <span className="h-2 w-2 rounded-full bg-[#b7843d]" aria-label="Belum dibaca" />}</span><span className="mt-1 block text-sm leading-5 text-[#6d7e74]">{item.message}</span><span className="mt-2 block text-xs text-[#89948d]">{new Date(item.createdAt).toLocaleString()}</span></span></div></button>; })}</div>}</>}</div>
    </section>
  </div>;
}
