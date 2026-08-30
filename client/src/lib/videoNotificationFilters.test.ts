import { describe, expect, it } from "vitest";
import { filterVideoNotifications } from "./videoNotificationFilters";

const items = [
  { kind: "uploaded" as const, title: "Video diterima", message: "kajian-akidah.mp4" },
  { kind: "processing" as const, title: "Sedang diproses", message: "kajian-akidah.mp4" },
  { kind: "translated" as const, title: "Subtitle siap", message: "dars-bahasa.mp4" },
  { kind: "failed" as const, title: "Video gagal", message: "rekaman rusak" },
];

describe("filterVideoNotifications", () => {
  it("menyaring notifikasi berdasarkan status", () => {
    expect(filterVideoNotifications(items, "translated", "")).toEqual([items[2]]);
  });

  it("mencari judul dan pesan tanpa peka kapital", () => {
    expect(filterVideoNotifications(items, "all", "AKIDAH")).toEqual([items[0], items[1]]);
    expect(filterVideoNotifications(items, "failed", "rusak")).toEqual([items[3]]);
  });
});
