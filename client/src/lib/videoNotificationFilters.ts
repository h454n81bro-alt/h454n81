export type VideoNotificationFilterKind = "all" | "uploaded" | "processing" | "translated" | "failed";

export type FilterableVideoNotification = {
  kind: Exclude<VideoNotificationFilterKind, "all">;
  title: string;
  message: string;
};

export function filterVideoNotifications<T extends FilterableVideoNotification>(items: T[], kind: VideoNotificationFilterKind, query: string) {
  const normalized = query.trim().toLocaleLowerCase("id-ID");
  return items.filter(item => {
    const matchesKind = kind === "all" || item.kind === kind;
    const haystack = `${item.title} ${item.message}`.toLocaleLowerCase("id-ID");
    return matchesKind && (!normalized || haystack.includes(normalized));
  });
}
