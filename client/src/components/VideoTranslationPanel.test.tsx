// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const helpers = vi.hoisted(() => ({
  mutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  query: () => ({ data: undefined, isLoading: false, isFetching: false, refetch: vi.fn() }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ videos: { list: { invalidate: vi.fn() }, get: { invalidate: vi.fn() }, summary: { invalidate: vi.fn() } } }),
    videos: {
      list: { useQuery: helpers.query },
      get: { useQuery: helpers.query },
      resumeInit: { useMutation: helpers.mutation },
      resumePreparePart: { useMutation: helpers.mutation },
      resumeConfirmPart: { useMutation: helpers.mutation },
      resumeFallbackPart: { useMutation: helpers.mutation },
      resumeComplete: { useMutation: helpers.mutation },
      importPublicUrl: { useMutation: helpers.mutation },
      updateCue: { useMutation: helpers.mutation },
      subtitle: { useQuery: helpers.query },
      summary: { useQuery: helpers.query },
      download: { useQuery: helpers.query },
      conversion8kStatus: { useQuery: helpers.query },
      request8kConversion: { useMutation: helpers.mutation },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

import { VideoTranslationPanel } from "./VideoTranslationPanel";

describe("VideoTranslationPanel", () => {
  afterEach(cleanup);

  it("menyediakan input file yang bersarang pada label unggah yang dapat diakses", () => {
    render(<VideoTranslationPanel open onClose={vi.fn()} />);

    const input = screen.getByLabelText(/Unggah atau lanjutkan video/i) as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.closest("label")?.textContent).toContain("Unggah atau lanjutkan video");
  });
});
