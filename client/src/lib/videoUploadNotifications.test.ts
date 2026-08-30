import { describe, expect, it } from "vitest";
import { completedUploadNotice, resumedUploadNotice } from "./videoUploadNotifications";

describe("video upload notifications", () => {
  it("membedakan notifikasi upload yang dilanjutkan dan telah lengkap", () => {
    expect(resumedUploadNotice()).toEqual(expect.objectContaining({ tone: "info", title: "Unggahan dilanjutkan" }));
    expect(completedUploadNotice()).toEqual(expect.objectContaining({ tone: "success", title: "Unggahan video lengkap" }));
  });
});
