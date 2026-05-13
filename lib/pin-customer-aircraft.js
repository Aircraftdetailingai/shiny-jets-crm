// Best-effort "pin a tail to the customer's aircraft list" helper.
//
// customer_aircraft references customer_accounts(id), not customers(id),
// because the portal owns that table. CRM-side invoice/quote creates only
// know the customer by email, so we:
//   1. resolve (or create a shell) customer_accounts row keyed on email
//   2. upsert customer_aircraft with onConflict: 'customer_account_id,tail_number'
//      so we never overwrite a manually-edited nickname/notes/storage_*
//      etc. that the customer entered via the portal.
//
// Never throws — this is a non-critical side effect of invoice/quote creation
// and should never block the primary write.
export async function pinCustomerAircraft(supabase, {
  detailerId,
  customerEmail,
  customerName,
  customerPhone,
  customerCompany,
  tailNumber,
  aircraftModel,
}) {
  try {
    const email = (customerEmail || '').toLowerCase().trim();
    const tail = (tailNumber || '').toUpperCase().trim();
    if (!email || !tail || !detailerId) return { ok: false, reason: 'missing fields' };

    // Find existing portal account by email.
    let { data: account } = await supabase
      .from('customer_accounts')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    // No portal account yet — create a shell one. password_hash stays null;
    // the customer can claim the account later via the magic-link flow.
    if (!account) {
      const shell = {
        email,
        name: customerName || '',
        phone: customerPhone || null,
        company: customerCompany || null,
        password_hash: null,
      };
      // Column-stripping retry in case the live schema lacks a soft column.
      let attempt = 0;
      let created = null;
      while (attempt < 4) {
        const { data, error } = await supabase
          .from('customer_accounts')
          .insert(shell)
          .select('id')
          .single();
        if (!error) { created = data; break; }
        const col = error.message?.match(/column "([^"]+)".*does not exist/i)?.[1]
          || error.message?.match(/Could not find the '([^']+)' column/i)?.[1];
        if (col && shell[col] !== undefined) { delete shell[col]; attempt++; continue; }
        // Race: another concurrent write inserted first — refetch.
        if (error.code === '23505') {
          const { data: re } = await supabase
            .from('customer_accounts')
            .select('id')
            .eq('email', email)
            .maybeSingle();
          if (re) { created = re; break; }
        }
        console.error('[pin-aircraft] account upsert failed:', error.message);
        return { ok: false, reason: error.message };
      }
      account = created;
    }
    if (!account?.id) return { ok: false, reason: 'no account' };

    // Upsert the aircraft row. ON CONFLICT does nothing — we never overwrite
    // user-entered nickname/notes/storage_*; this is purely additive.
    let row = {
      customer_account_id: account.id,
      detailer_id: detailerId,
      tail_number: tail,
      model: aircraftModel || null,
    };
    let attempt = 0;
    while (attempt < 4) {
      const { error } = await supabase
        .from('customer_aircraft')
        .upsert(row, { onConflict: 'customer_account_id,tail_number', ignoreDuplicates: true });
      if (!error) return { ok: true, customer_account_id: account.id };
      const col = error.message?.match(/column "([^"]+)".*does not exist/i)?.[1]
        || error.message?.match(/Could not find the '([^']+)' column/i)?.[1];
      if (col && row[col] !== undefined) { delete row[col]; attempt++; continue; }
      console.error('[pin-aircraft] customer_aircraft upsert failed:', error.message);
      return { ok: false, reason: error.message };
    }
    return { ok: false, reason: 'retry-exhausted' };
  } catch (e) {
    console.error('[pin-aircraft] unexpected:', e?.message || e);
    return { ok: false, reason: 'exception' };
  }
}
