function incrementLastNumber(previousNumber) {
  if (!previousNumber) {
    return 1;
  }

  const parts = previousNumber.split("-");
  if (parts.length < 3) {
    return 1;
  }

  const value = Number(parts[2]);
  if (!Number.isFinite(value)) {
    return 1;
  }

  return value + 1;
}

function formatNumber(prefix, year, sequence) {
  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
}

export async function generateQuoteNumber(client, agencyId) {
  await client.query("SELECT id FROM agencies WHERE id = $1 FOR UPDATE", [agencyId]);
  const prefix = "DEV";
  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-%`;

  const { rows } = await client.query(
    `SELECT quote_number
     FROM quotes
     WHERE agency_id = $1
       AND quote_number LIKE $2
     ORDER BY CAST(SPLIT_PART(quote_number, '-', 3) AS INTEGER) DESC
     LIMIT 1
     FOR UPDATE`,
    [agencyId, pattern]
  );

  const nextSequence = incrementLastNumber(rows[0]?.quote_number);
  return formatNumber(prefix, year, nextSequence);
}

export async function generateInvoiceNumber(client, agencyId) {
  await client.query("SELECT id FROM agencies WHERE id = $1 FOR UPDATE", [agencyId]);
  const prefix = "FAC";
  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-%`;

  const { rows } = await client.query(
    `SELECT invoice_number
     FROM invoices
     WHERE agency_id = $1
       AND invoice_number LIKE $2
     ORDER BY CAST(SPLIT_PART(invoice_number, '-', 3) AS INTEGER) DESC
     LIMIT 1
     FOR UPDATE`,
    [agencyId, pattern]
  );

  const nextSequence = incrementLastNumber(rows[0]?.invoice_number);
  return formatNumber(prefix, year, nextSequence);
}

export async function generatePurchaseNumber(client, agencyId) {
  await client.query("SELECT id FROM agencies WHERE id = $1 FOR UPDATE", [agencyId]);
  const prefix = "ACH";
  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-%`;

  const { rows } = await client.query(
    `SELECT purchase_number
     FROM purchases
     WHERE agency_id = $1
       AND purchase_number LIKE $2
     ORDER BY CAST(SPLIT_PART(purchase_number, '-', 3) AS INTEGER) DESC
     LIMIT 1
     FOR UPDATE`,
    [agencyId, pattern]
  );

  const nextSequence = incrementLastNumber(rows[0]?.purchase_number);
  return formatNumber(prefix, year, nextSequence);
}

export async function generateExpenseNumber(client, agencyId) {
  await client.query("SELECT id FROM agencies WHERE id = $1 FOR UPDATE", [agencyId]);
  const prefix = "DEP";
  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-%`;

  const { rows } = await client.query(
    `SELECT expense_number
     FROM expenses
     WHERE agency_id = $1
       AND expense_number LIKE $2
     ORDER BY CAST(SPLIT_PART(expense_number, '-', 3) AS INTEGER) DESC
     LIMIT 1
     FOR UPDATE`,
    [agencyId, pattern]
  );

  const nextSequence = incrementLastNumber(rows[0]?.expense_number);
  return formatNumber(prefix, year, nextSequence);
}
