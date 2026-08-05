const DEFAULT_CURRENCY = "CAD";

let cachedLocale = null;

function resolveLocale() {
  if (cachedLocale) {
    return cachedLocale;
  }

  if (typeof navigator !== "undefined") {
    cachedLocale =
      (Array.isArray(navigator.languages) && navigator.languages.find(Boolean)) ||
      navigator.language ||
      "fr-CA";
  } else {
    cachedLocale = "fr-CA";
  }

  return cachedLocale;
}

export function getCurrencyByCountry() {
  return DEFAULT_CURRENCY;
}

export function getLocaleByBrowser() {
  return resolveLocale();
}

export function formatCurrency(value, currency) {
  const activeCurrency = currency || DEFAULT_CURRENCY;
  return new Intl.NumberFormat(getLocaleByBrowser(), {
    style: "currency",
    currency: activeCurrency
  }).format(Number(value || 0));
}

export function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString(getLocaleByBrowser());
}

export function formatCompactDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  return date.toLocaleDateString(getLocaleByBrowser(), {
    day: "2-digit",
    month: "short"
  });
}

export function toInputDate(value) {
  if (!value) {
    return "";
  }
  return new Date(value).toISOString().slice(0, 10);
}
