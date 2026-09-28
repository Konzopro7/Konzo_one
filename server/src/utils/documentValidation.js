import { z } from "zod";
import { isCivilDate } from "../../../shared/dates.mjs";
import { computeTotals } from "./calculations.js";
import { hasDecimalPrecision } from "../../../shared/documentTotals.mjs";

export const documentTaxRate = z
  .number()
  .finite()
  .min(0)
  .max(1)
  .refine(
    (value) => hasDecimalPrecision(value, 5),
    "Le taux accepte au maximum trois décimales en pourcentage.",
  )
  .default(0.2);

export const optionalDocumentDate = z
  .string()
  .refine(isCivilDate, "Choisissez une date valide (AAAA-MM-JJ).")
  .nullable()
  .optional();
export const documentItems = z
  .array(
    z.object({
      description: z
        .string()
        .trim()
        .min(1, "La description du service est obligatoire.")
        .max(10000),
      unitPrice: z.coerce
        .number()
        .finite()
        .nonnegative("Le prix ne peut pas être négatif.")
        .max(9999999999.99)
        .refine(
          (value) => hasDecimalPrecision(value, 2),
          "Le prix accepte au maximum deux décimales.",
        ),
      quantity: z.coerce
        .number()
        .finite()
        .positive("La quantité doit être supérieure à zéro.")
        .max(1000000)
        .refine(
          (value) => hasDecimalPrecision(value, 2),
          "La quantité accepte au maximum deux décimales.",
        ),
    }),
  )
  .min(1, "Ajoutez au moins un service.")
  .max(200, "Maximum 200 services par document.");

export function validateDocumentAmount(value, ctx) {
  if (computeTotals(value.items, value.taxRate).total > 9999999999.99) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["items"],
      message: "Le montant du document dépasse la limite autorisée.",
    });
  }
}
