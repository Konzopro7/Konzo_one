import { z } from "zod";

// Fixed identifier map: request keys never become SQL identifiers directly.
export const profileColumns = {
  firstName: "first_name", lastName: "last_name", jobTitle: "job_title",
  secondaryPhone: "secondary_phone", address: "address", city: "city",
  province: "province", postalCode: "postal_code", country: "country",
  preferredLanguage: "preferred_language", source: "source", crmStatus: "crm_status",
  tags: "tags", notes: "notes"
};
const optionalText = max => z.string().trim().max(max).nullable().optional();
export const contactProfileShape = {
  firstName: optionalText(100), lastName: optionalText(100), jobTitle: optionalText(150),
  secondaryPhone: optionalText(60), address: optionalText(1000), city: optionalText(120),
  province: optionalText(100), postalCode: optionalText(30), country: optionalText(100),
  preferredLanguage: z.enum(["fr-CA", "en-CA"]).nullable().optional(),
  source: optionalText(120), crmStatus: z.enum(["prospect", "active", "inactive"]).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).transform(values => [...new Set(values)]).nullable().optional(),
  notes: optionalText(20000)
};
export function mapContactProfile(row) {
  return Object.fromEntries(Object.entries(profileColumns).map(([key, column]) => [key, row[column] ?? (key === "tags" ? [] : null)]));
}
export function suppliedProfile(payload) {
  return Object.entries(profileColumns).filter(([key]) => Object.hasOwn(payload, key))
    .map(([key, column]) => [column, payload[key] === "" ? null : payload[key]]);
}
