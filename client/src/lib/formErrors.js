import { isCivilDate } from "../../../shared/dates.mjs";
import {
  computeTotals,
  hasDecimalPrecision,
} from "../../../shared/documentTotals.mjs";

export function apiErrorMessage(
  error,
  fallback = "Action impossible. Réessayez.",
) {
  const payload = error.response?.data;
  const detail = Object.values(payload?.issues?.fieldErrors || {})
    .flat()
    .find(Boolean);
  if (detail) return detail;
  return payload?.message === "Validation failed."
    ? "Vérifiez les informations du formulaire."
    : payload?.message || fallback;
}

export function documentFormError(form) {
  if (!form.clientId) return "Sélectionnez un client.";
  const date = form.dueDate ?? form.validUntil;
  if (date && !isCivilDate(date)) return "Choisissez une date valide.";
  if (
    !Number.isFinite(Number(form.taxRate)) ||
    form.taxRate < 0 ||
    form.taxRate > 1
  )
    return "Le taux de taxe doit être compris entre 0 et 100 %.";
  if (!hasDecimalPrecision(form.taxRate, 5))
    return "Le taux accepte au maximum trois décimales en pourcentage.";
  if (!form.items?.length || form.items.length > 200)
    return "Ajoutez entre 1 et 200 services.";
  for (const [index, item] of form.items.entries()) {
    if (!item.description?.trim())
      return `Ligne ${index + 1} : indiquez une description.`;
    if (!Number.isFinite(Number(item.unitPrice)) || item.unitPrice < 0)
      return `Ligne ${index + 1} : indiquez un prix positif ou nul.`;
    if (!Number.isFinite(Number(item.quantity)) || item.quantity <= 0)
      return `Ligne ${index + 1} : la quantité doit être supérieure à zéro.`;
    if (
      !hasDecimalPrecision(item.unitPrice, 2) ||
      !hasDecimalPrecision(item.quantity, 2)
    )
      return `Ligne ${index + 1} : utilisez au maximum deux décimales pour le prix et la quantité.`;
  }
  if (computeTotals(form.items, form.taxRate).total > 9999999999.99)
    return "Le montant du document dépasse la limite autorisée.";
  return null;
}
