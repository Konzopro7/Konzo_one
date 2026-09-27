export const contactFields = [
  ["firstName", "Prénom", 100], ["lastName", "Nom de famille", 100],
  ["jobTitle", "Fonction", 150], ["secondaryPhone", "Deuxième téléphone", 60],
  ["address", "Adresse", 1000], ["city", "Ville", 120],
  ["province", "Province / État", 100], ["postalCode", "Code postal", 30],
  ["country", "Pays", 100], ["source", "Source", 120]
];
export const languageOptions = [["", "Non renseignée"], ["fr-CA", "Français canadien"], ["en-CA", "Anglais canadien"]];
export const contactStatusOptions = [["", "Non renseigné"], ["prospect", "Prospect"], ["active", "Actif"], ["inactive", "Inactif"]];
export const emptyContactProfile = Object.fromEntries([
  ...contactFields.map(([key]) => [key, ""]),
  ["preferredLanguage", ""], ["crmStatus", ""], ["tags", ""], ["notes", ""]
]);

export default function ContactFields({ form, onChange, disabled }) {
  return (
    <details className="rounded-xl border border-slate-200 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">Informations CRM complémentaires</summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {contactFields.map(([key, label, maxLength]) => (
          <div key={key}>
            <label className="field-label" htmlFor={`contact-${key}`}>{label}</label>
            <input id={`contact-${key}`} className="field-input" value={form[key] || ""}
              maxLength={maxLength} disabled={disabled} onChange={event => onChange(key, event.target.value)} />
          </div>
        ))}
        {[["preferredLanguage", "Langue préférée", languageOptions], ["crmStatus", "Statut CRM", contactStatusOptions]].map(([key, label, options]) => (
          <div key={key}>
            <label className="field-label" htmlFor={`contact-${key}`}>{label}</label>
            <select id={`contact-${key}`} className="field-input" value={form[key] || ""} disabled={disabled} onChange={event => onChange(key, event.target.value)}>
              {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </div>
        ))}
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="contact-tags">Tags (séparés par des virgules)</label>
          <input id="contact-tags" className="field-input" value={form.tags || ""} maxLength={1529} disabled={disabled} onChange={event => onChange("tags", event.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="contact-notes">Notes</label>
          <textarea id="contact-notes" className="field-input" rows={4} maxLength={20000} value={form.notes || ""} disabled={disabled} onChange={event => onChange("notes", event.target.value)} />
        </div>
      </div>
    </details>
  );
}

export function ContactProfile({ client }) {
  const values = [
    ...contactFields.map(([key, label]) => [label, client[key]]),
    ["Langue préférée", languageOptions.find(([key]) => key === client.preferredLanguage)?.[1]],
    ["Statut CRM", contactStatusOptions.find(([key]) => key === client.crmStatus)?.[1]],
    ["Tags", client.tags?.join(", ")], ["Notes", client.notes]
  ].filter(([, value]) => value);
  if (!values.length) return null;
  return <dl className="grid gap-3 text-sm sm:grid-cols-2">
    {values.map(([label, value]) => <div key={label} className={label === "Notes" ? "sm:col-span-2" : ""}>
      <dt className="font-semibold text-slate-700">{label}</dt>
      <dd className="whitespace-pre-wrap break-words text-slate-600">{value}</dd>
    </div>)}
  </dl>;
}
