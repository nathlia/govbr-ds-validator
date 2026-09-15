/**
 * Ações de estado aceitas pelas ferramentas que reabrem a página. Um único esquema para `scan_page`
 * e `verify_finding`: um estado reproduzido para varrer tem de ser reproduzível para verificar.
 */
import { z } from "zod";

export const PageActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("click"), selector: z.string() }),
  z.object({ action: z.literal("fill"), selector: z.string(), value: z.string().max(2_000) }),
  z.object({ action: z.literal("press"), key: z.string(), selector: z.string().optional() }),
  z.object({
    action: z.literal("wait"),
    selector: z.string().optional(),
    ms: z.number().int().min(0).max(5_000).optional(),
  }),
]);

export const PageActionsSchema = z.array(PageActionSchema).max(20);
