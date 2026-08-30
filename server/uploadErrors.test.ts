import { describe, expect, it } from "vitest";
import { isStorageUploadError, storageUploadErrorMessage } from "./uploadErrors";

describe("storage upload errors", () => {
  it("mengenali penolakan ukuran dari layanan penyimpanan", () => {
    const error = new Error("Storage upload to S3 failed (413 Payload Too Large)");
    expect(isStorageUploadError(error)).toBe(true);
    expect(storageUploadErrorMessage(error)).toContain("tidak dibatasi oleh aplikasi");
  });

  it("memberi pesan aman untuk gangguan storage lain", () => {
    expect(storageUploadErrorMessage(new Error("Storage presign failed (503)"))).toContain("belum dapat disimpan");
  });
});
