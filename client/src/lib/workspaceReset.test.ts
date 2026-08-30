import { describe, expect, it } from "vitest";
import { workspaceResetState } from "./workspaceReset";

describe("workspaceResetState", () => {
  it("mengosongkan pembaca dan kembali ke halaman pertama tanpa menyentuh riwayat", () => {
    expect(workspaceResetState()).toEqual({
      selectedDocumentId: null,
      page: 0,
      isSidebarOpen: false,
      isWorkspaceCleared: true,
    });
  });
});
