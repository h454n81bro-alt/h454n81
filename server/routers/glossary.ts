import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createGlossaryTerm,
  deleteGlossaryTermForUser,
  getGlossaryForUser,
  updateGlossaryTermForUser,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const glossaryInput = z.object({
  arabicTerm: z.string().trim().min(1, "Istilah Arab wajib diisi.").max(500),
  indonesianTerm: z.string().trim().min(1, "Padanan Indonesia wajib diisi.").max(500),
  note: z.string().trim().max(500).optional(),
});

export type PromptGlossaryTerm = {
  id?: number;
  arabicTerm: string;
  indonesianTerm: string;
  note?: string | null;
};

export function formatGlossaryForPrompt(terms: PromptGlossaryTerm[]) {
  if (terms.length === 0) return "Tidak ada glosarium khusus yang aktif.";
  return [
    "GLOSARIUM WAJIB: Jika istilah Arab di bawah muncul, gunakan tepat padanan Indonesia yang ditetapkan. Jangan mengganti padanan tersebut dengan sinonim atau transliterasi lain.",
    ...terms.map(term => `- ID glosarium: ${term.id ?? "tanpa-id"} | Arab: ${term.arabicTerm} | Indonesia wajib: ${term.indonesianTerm}${term.note ? ` | Catatan: ${term.note}` : ""}`),
  ].join("\n");
}

export const glossaryRouter = router({
  list: protectedProcedure.query(({ ctx }) => getGlossaryForUser(ctx.user.id)),

  create: protectedProcedure.input(glossaryInput).mutation(async ({ ctx, input }) => {
    try {
      const id = await createGlossaryTerm({
        userId: ctx.user.id,
        arabicTerm: input.arabicTerm,
        indonesianTerm: input.indonesianTerm,
        note: input.note || null,
      });
      return { id };
    } catch (error) {
      if (error instanceof Error && /duplicate|unique/i.test(error.message)) {
        throw new TRPCError({ code: "CONFLICT", message: "Istilah Arab tersebut sudah ada di glosarium." });
      }
      throw error;
    }
  }),

  update: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), ...glossaryInput.shape }))
    .mutation(async ({ ctx, input }) => {
      await updateGlossaryTermForUser(input.id, ctx.user.id, {
        arabicTerm: input.arabicTerm,
        indonesianTerm: input.indonesianTerm,
        note: input.note || null,
      });
      return { success: true } as const;
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await deleteGlossaryTermForUser(input.id, ctx.user.id);
      return { success: true } as const;
    }),
});
