// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  mutate: vi.fn(),
  invalidate: vi.fn(),
  isPending: false,
  onError: undefined as undefined | ((error: { message?: string }) => void),
  onSuccess: undefined as undefined | ((result: { videoId?: number; sourcePageUrl?: string; guidance?: string }) => void),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ videos: { list: { invalidate: dependencies.invalidate } } }),
    videos: {
      importPublicUrl: {
        useMutation: (options?: { onError?: (error: { message?: string }) => void; onSuccess?: (result: { videoId?: number; sourcePageUrl?: string; guidance?: string }) => void }) => {
          dependencies.onError = options?.onError;
          dependencies.onSuccess = options?.onSuccess;
          return { mutate: dependencies.mutate, isPending: dependencies.isPending };
        },
      },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { PublicVideoDownloadPanel } from "./PublicVideoDownloadPanel";

describe("PublicVideoDownloadPanel", () => {
  afterEach(cleanup);

  beforeEach(() => {
    dependencies.mutate.mockReset();
    dependencies.invalidate.mockReset();
    dependencies.isPending = false;
    dependencies.onError = undefined;
    dependencies.onSuccess = undefined;
  });

  it("menampilkan peringatan tautan publik dan DRM serta menonaktifkan submit sampai URL valid", () => {
    render(<PublicVideoDownloadPanel open onClose={vi.fn()} onImported={vi.fn()} />);

    expect(screen.getByText(/Hanya tautan media publik langsung/i)).toBeTruthy();
    expect(screen.getByText(/DRM, paywall/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Unduh & Proses Video/i }).getAttribute("disabled")).not.toBeNull();
  });

  it("mengirim URL dan bahasa sumber yang valid ke mutasi import", () => {
    render(<PublicVideoDownloadPanel open onClose={vi.fn()} onImported={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("https://contoh.com/video.mp4"), { target: { value: "https://cdn.example.com/kuliah.mp4" } });
    fireEvent.change(screen.getByDisplayValue("Deteksi otomatis"), { target: { value: "english" } });
    fireEvent.click(screen.getByRole("button", { name: /Unduh & Proses Video/i }));

    expect(dependencies.mutate).toHaveBeenCalledWith({ url: "https://cdn.example.com/kuliah.mp4", sourceLanguage: "english" });
  });

  it("menampilkan state loading dan menahan submit ganda", () => {
    dependencies.isPending = true;
    render(<PublicVideoDownloadPanel open onClose={vi.fn()} onImported={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Mengunduh dan memproses/i }).getAttribute("disabled")).not.toBeNull();
  });

  it("menampilkan panduan inline ketika URL adalah halaman web, bukan media langsung", () => {
    render(<PublicVideoDownloadPanel open onClose={vi.fn()} onImported={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("https://contoh.com/video.mp4"), { target: { value: "https://contoh.org/halaman-video" } });

    act(() => dependencies.onError?.({ message: "Tautan mengarah ke halaman web, bukan berkas video langsung. Gunakan URL file media publik yang dapat diputar atau diunduh langsung." }));

    expect(screen.getByRole("alert").textContent).toContain("Gunakan tombol unduh resmi");
    expect(screen.getByRole("link", { name: /Buka halaman sumber/i }).getAttribute("href")).toBe("https://contoh.org/halaman-video");
  });

  it("memperlakukan hasil halaman sumber dari router sebagai panduan, bukan error mutasi", async () => {
    const onClose = vi.fn();
    const onImported = vi.fn();
    render(<PublicVideoDownloadPanel open onClose={onClose} onImported={onImported} />);

    await act(async () => {
      await dependencies.onSuccess?.({
        sourcePageUrl: "https://contoh.org/halaman-video",
        guidance: "Tautan ini adalah halaman publik, bukan file video.",
      });
    });

    expect(screen.getByRole("alert").textContent).toContain("halaman publik");
    expect(screen.getByRole("link", { name: /Buka halaman sumber/i }).getAttribute("href")).toBe("https://contoh.org/halaman-video");
    expect(onImported).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(dependencies.invalidate).not.toHaveBeenCalled();
  });
});
