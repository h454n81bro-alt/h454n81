import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { createServer } from "node:http";
import express from "express";
import superjson from "superjson";
import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ createDocumentWithSegments: vi.fn() }));
const storage = vi.hoisted(() => ({ storageGetSignedUrl: vi.fn(), storageCreatePresignedPut: vi.fn(), storagePut: vi.fn() }));

vi.mock("./db", () => db);
vi.mock("./storage", () => storage);
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));

import { appRouter } from "./routers";

describe("tRPC upload transport", () => {
  let server: ReturnType<typeof createServer> | undefined;

  afterEach(async () => {
    vi.unstubAllGlobals();
    await new Promise<void>(resolve => server?.close(() => resolve()));
    server = undefined;
  });

  it("mengembalikan JSON untuk finalisasi metadata kecil, bukan halaman HTML PayloadTooLarge", async () => {
    db.createDocumentWithSegments.mockResolvedValue(901);
    storage.storageGetSignedUrl.mockResolvedValue("https://download.example/kitab.txt");
    const nativeFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("download.example")) {
        return { ok: true, arrayBuffer: async () => Buffer.from("هذا نص عربي صالح للاختبار") };
      }
      return nativeFetch(input, init);
    }));
    const app = express();
    app.use(express.json({ limit: "50mb" }));
    app.use("/api/trpc", createExpressMiddleware({
      router: appRouter,
      createContext: async ({ req, res }) => ({ req, res, user: { id: 41 } }) as never,
    }));
    server = createServer(app);
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server tidak dapat dimulai.");

    const client = createTRPCProxyClient<typeof appRouter>({
      links: [httpBatchLink({ url: `http://127.0.0.1:${address.port}/api/trpc`, transformer: superjson })],
    });
    const payload = await client.documents.finalizeUpload.mutate({
      fileName: "kitab.txt",
      mimeType: "text/plain",
      sourceLanguage: "arabic",
      storageKey: "documents/41/kitab.txt",
    });

    expect(payload).toEqual({ documentId: 901, paragraphCount: 1 });
  });
});
