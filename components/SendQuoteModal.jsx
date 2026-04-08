"use client";
import { useState, useEffect } from "react";
import CustomerSelector from "./CustomerSelector";
import { formatPrice, currencySymbol } from "@/lib/formatPrice";
import { useToast } from "./Toast";
import PhoneInput from '@/components/PhoneInput';

export default function SendQuoteModal({ isOpen, onClose, onSuccess, quote, user, preselectedCustomer, initialStep }) {
  const { success: toastSuccess, error: toastError } = useToast();
  const startStep = initialStep || 1;
  const [step, setStep] = useState(startStep); // 1=customer, 2=preview, 3=compose
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [customerMode, setCustomerMode] = useState("existing");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [newCustomerFields, setNewCustomerFields] = useState({
    name: "",
    email: "",
    phone: "",
    companyName: "",
  });
  const [method, setMethod] = useState("email");
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [error, setError] = useState("");
  const [quoteLimitHit, setQuoteLimitHit] = useState(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringInterval, setRecurringInterval] = useState("4_weeks");
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");

  // Created quote state
  const [createdQuote, setCreatedQuote] = useState(null); // { id, share_link }

  // Message composer state
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [previewOpen, setPreviewOpen] = useState(true);

  // Contact fields
  const [pocName, setPocName] = useState("");
  const [pocPhone, setPocPhone] = useState("");
  const [pocEmail, setPocEmail] = useState("");
  const [pocRole, setPocRole] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [contactNotes, setContactNotes] = useState("");
  const [showContacts, setShowContacts] = useState(false);
  const [customerLocked, setCustomerLocked] = useState(false);

  // Auto-select preselected customer when modal opens
  useEffect(() => {
    if (isOpen && preselectedCustomer && !selectedCustomer) {
      setSelectedCustomer(preselectedCustomer);
      setClientName(preselectedCustomer.name || "");
      setClientEmail(preselectedCustomer.email || "");
      setClientPhone(preselectedCustomer.phone || "");
      setClientCompany(preselectedCustomer.company_name || "");
      setCustomerMode("existing");
      setCustomerLocked(true);
      if (preselectedCustomer.poc_name) setPocName(preselectedCustomer.poc_name);
      if (preselectedCustomer.poc_phone) setPocPhone(preselectedCustomer.poc_phone);
      if (preselectedCustomer.poc_email) setPocEmail(preselectedCustomer.poc_email);
      if (preselectedCustomer.poc_role) setPocRole(preselectedCustomer.poc_role);
      if (preselectedCustomer.emergency_contact_name) setEmergencyName(preselectedCustomer.emergency_contact_name);
      if (preselectedCustomer.emergency_contact_phone) setEmergencyPhone(preselectedCustomer.emergency_contact_phone);
      if (preselectedCustomer.contact_notes) setContactNotes(preselectedCustomer.contact_notes);
      if (preselectedCustomer.poc_name || preselectedCustomer.emergency_contact_name) setShowContacts(true);
    }
  }, [isOpen, preselectedCustomer]);

  // Auto-advance: when initialStep >= 2 and customer is ready, create quote immediately
  const [autoAdvanced, setAutoAdvanced] = useState(false);
  useEffect(() => {
    if (isOpen && startStep >= 2 && !autoAdvanced && !createdQuote && (selectedCustomer || clientEmail)) {
      setAutoAdvanced(true);
      // Defer to next tick so effectiveName/effectiveEmail are resolved
      setTimeout(() => handleSaveAndReview(), 0);
    }
  }, [isOpen, startStep, selectedCustomer, clientEmail, autoAdvanced, createdQuote]);

  // Reset step when modal closes
  useEffect(() => {
    if (!isOpen) { setStep(startStep); setCreatedQuote(null); setError(""); setAutoAdvanced(false); }
  }, [isOpen]);

  if (!isOpen) return null;

  const ADMIN_EMAILS = ['brett@vectorav.ai', 'admin@vectorav.ai', 'brett@shinyjets.com'];
  const isBusiness = user?.plan === "business" || user?.plan === "enterprise" || user?.is_admin || ADMIN_EMAILS.includes(user?.email?.toLowerCase());
  const totalPrice = parseFloat(quote?.totalPrice) || 0;
  const aircraftName = quote?.aircraft?.name || "";

  const effectiveName = selectedCustomer?.name || newCustomerFields.name || clientName;
  const effectiveEmail = selectedCustomer?.email || newCustomerFields.email || clientEmail;
  const effectivePhone = selectedCustomer?.phone || newCustomerFields.phone || clientPhone;
  const effectiveCompany = selectedCustomer?.company_name || newCustomerFields.companyName || clientCompany;
  const effectiveCustomerId = selectedCustomer?.id || null;

  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    setClientName(customer.name || "");
    setClientEmail(customer.email || "");
    setClientPhone(customer.phone || "");
    setClientCompany(customer.company_name || "");
    if (customer.poc_name) setPocName(customer.poc_name);
    if (customer.poc_phone) setPocPhone(customer.poc_phone);
    if (customer.poc_email) setPocEmail(customer.poc_email);
    if (customer.poc_role) setPocRole(customer.poc_role);
    if (customer.emergency_contact_name) setEmergencyName(customer.emergency_contact_name);
    if (customer.emergency_contact_phone) setEmergencyPhone(customer.emergency_contact_phone);
    if (customer.contact_notes) setContactNotes(customer.contact_notes);
    if (customer.poc_name || customer.emergency_contact_name) setShowContacts(true);
  };

  const handleCustomerClear = () => {
    setSelectedCustomer(null);
    setClientName(""); setClientEmail(""); setClientPhone(""); setClientCompany("");
    setNewCustomerFields({ name: "", email: "", phone: "", companyName: "" });
    setPocName(""); setPocPhone(""); setPocEmail(""); setPocRole("");
    setEmergencyName(""); setEmergencyPhone(""); setContactNotes("");
    setShowContacts(false);
  };

  const handleNewCustomerFieldChange = (updates) => {
    setNewCustomerFields((prev) => ({ ...prev, ...updates }));
    if (updates.name !== undefined) setClientName(updates.name);
    if (updates.email !== undefined) setClientEmail(updates.email);
    if (updates.phone !== undefined) setClientPhone(updates.phone);
    if (updates.companyName !== undefined) setClientCompany(updates.companyName);
  };

  // ─── Save customer + create quote (draft) ───
  const saveAndCreateQuote = async () => {
    if (!effectiveName) throw new Error("Customer name is required");
    if (!effectiveEmail) throw new Error("Customer email is required");

    const token = localStorage.getItem("vector_token");
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    // Upsert customer
    let resolvedCustomerId = effectiveCustomerId;
    if (!resolvedCustomerId && effectiveEmail) {
      try {
        const custRes = await fetch("/api/customers", { method: "POST", headers, body: JSON.stringify({
          name: effectiveName, email: effectiveEmail, phone: effectivePhone || null, company_name: effectiveCompany || null,
        }) });
        if (custRes.ok) {
          const custData = await custRes.json();
          if (custData.customer?.id) resolvedCustomerId = custData.customer.id;
        }
      } catch (e) { console.error('Customer save failed:', e); }
    }

    // If quote already has id, just update client info
    if (quote?.id && quote?.share_link) {
      await fetch(`/api/quotes/${quote.id}`, { method: "PUT", headers, body: JSON.stringify({
        client_name: effectiveName, client_email: effectiveEmail, client_phone: effectivePhone || null,
        customer_id: resolvedCustomerId, airport: quote?.airport || null,
      }) });
      return { id: quote.id, share_link: quote.share_link };
    }

    // Create new quote
    const lineItems = quote?.lineItems || (quote?.selectedServices || []).map(svc => ({
      service_id: svc.id, description: svc.name, hours: 0, amount: 0,
    }));

    const payload = {
      aircraft_type: quote?.aircraft?.category || quote?.aircraft?.name || "unknown",
      aircraft_model: quote?.aircraft?.name || "",
      aircraft_id: quote?.aircraft?.id || null,
      surface_area_sqft: quote?.aircraft?.surface_area_sqft || null,
      selected_services: (quote?.selectedServices || []).map(s => s.id),
      selected_package_id: quote?.selectedPackage?.id || null,
      selected_package_name: quote?.selectedPackage?.name || null,
      total_hours: quote?.totalHours || 0,
      total_price: quote?.totalPrice || 0,
      notes: quote?.notes || "",
      line_items: lineItems,
      labor_total: quote?.laborTotal || 0,
      products_total: quote?.productsTotal || 0,
      access_difficulty: quote?.accessDifficulty || 1.0,
      job_location: quote?.jobLocation || null,
      minimum_fee_applied: quote?.isMinimumApplied || false,
      calculated_price: quote?.calculatedPrice || quote?.totalPrice || 0,
      discount_percent: quote?.discountPercent || 0,
      addon_fees: quote?.addonFees || [],
      addon_total: quote?.addonsTotal || 0,
      customer_id: resolvedCustomerId,
      customer_phone: effectivePhone || null,
      customer_company: effectiveCompany || null,
      airport: quote?.airport || null,
      tail_number: quote?.tailNumber || null,
      proposed_date: quote?.proposedDate || null,
      proposed_time: quote?.proposedTime || null,
      product_estimates: quote?.productEstimates || [],
      linked_products: quote?.linkedProducts || [],
      linked_equipment: quote?.linkedEquipment || [],
      poc_name: pocName || null, poc_phone: pocPhone || null, poc_email: pocEmail || null, poc_role: pocRole || null,
      emergency_contact_name: emergencyName || null, emergency_contact_phone: emergencyPhone || null,
      contact_notes: contactNotes || null,
    };

    const res = await fetch("/api/quotes", { method: "POST", headers, body: JSON.stringify(payload) });
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      if (res.status === 403 && errData?.upgrade) { setQuoteLimitHit(errData); throw new Error("QUOTE_LIMIT"); }
      throw new Error(errData?.error || 'Failed to create');
    }
    const data = await res.json();
    return { id: data.id, share_link: data.share_link };
  };

  // ─── Step 1 → Step 2: Save & Review ───
  const handleSaveAndReview = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await saveAndCreateQuote();
      setCreatedQuote(result);

      // Prepare email defaults
      const companyName = user?.company || 'Your Detailer';
      const firstName = (effectiveName || '').split(' ')[0] || 'there';
      const aircraft = aircraftName || 'your aircraft';
      const price = `${currencySymbol()}${formatPrice(totalPrice)}`;
      setEmailSubject(`Your Quote from ${companyName} — ${aircraft} — ${price}`);
      setEmailBody(
`Hi ${firstName},

Thank you for reaching out to ${companyName}! We've put together a detailed quote for your ${aircraft} and we're excited about the opportunity to take care of it.

Please review your quote using the link below. You can approve and pay securely online — the process takes less than two minutes.

If you have any questions or would like to adjust anything, just reply to this email and we'll take care of it right away.

We look forward to making your aircraft shine.

Best,
${user?.name || companyName}
${companyName}${user?.phone ? '\n' + user.phone : ''}`
      );
      setStep(2);
    } catch (err) {
      if (err.message !== "QUOTE_LIMIT") setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 1: Save as Draft only ───
  const handleSaveDraft = async () => {
    setError("");
    setDraftLoading(true);
    try {
      await saveAndCreateQuote();
      // Save contacts to customer
      const finalCustId = effectiveCustomerId;
      if (finalCustId && (pocName || emergencyName)) {
        try {
          await fetch(`/api/customers/${finalCustId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('vector_token')}` },
            body: JSON.stringify({ poc_name: pocName || null, poc_phone: pocPhone || null, poc_email: pocEmail || null, poc_role: pocRole || null, emergency_contact_name: emergencyName || null, emergency_contact_phone: emergencyPhone || null, contact_notes: contactNotes || null }),
          });
        } catch {}
      }
      toastSuccess("Quote saved as draft!");
      if (onSuccess) onSuccess(); else onClose();
    } catch (err) {
      if (err.message !== "QUOTE_LIMIT") setError(err.message);
    } finally {
      setDraftLoading(false);
    }
  };

  // ─── Step 2/3: Send the quote ───
  const handleSendQuote = async () => {
    if (!createdQuote?.id) {
      setError("Quote not saved yet. Please wait and try again.");
      return;
    }
    setError("");
    setLoading(true);
    console.log('[SendQuote] Sending quote:', createdQuote.id, 'to:', effectiveEmail, 'subject:', emailSubject);
    try {
      const token = localStorage.getItem("vector_token");
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      if (isScheduled && scheduledDate) {
        const sendTime = new Date(scheduledDate);
        if (sendTime <= new Date()) throw new Error("Scheduled time must be in the future");
        const schedRes = await fetch("/api/scheduled-quotes", { method: "POST", headers, body: JSON.stringify({
          quote_id: createdQuote.id, send_at: sendTime.toISOString(),
          client_name: effectiveName, client_email: effectiveEmail, client_phone: effectivePhone || null,
          client_company: effectiveCompany || null, customer_id: effectiveCustomerId, airport: quote?.airport || null,
        }) });
        if (!schedRes.ok) { const d = await schedRes.json().catch(() => null); throw new Error(d?.error || "Failed to schedule"); }
        toastSuccess(`Quote scheduled for ${sendTime.toLocaleString()}`);
        if (onSuccess) onSuccess(); else onClose();
        return;
      }

      const sendPayload = {
        clientName: effectiveName, clientEmail: effectiveEmail, clientCompany: effectiveCompany || null,
        customerId: effectiveCustomerId, airport: quote?.airport || null,
        emailSubject, emailBody,
      };
      if (effectivePhone) sendPayload.clientPhone = effectivePhone;

      const res = await fetch(`/api/quotes/${createdQuote.id}/send`, { method: "POST", headers, body: JSON.stringify(sendPayload) });
      if (!res.ok) { const data = await res.json().catch(() => null); throw new Error(data?.error || 'Failed to send'); }
      const sendResult = await res.json();

      // Set up recurring
      if (isRecurring) {
        const interval = recurringInterval || 'monthly';
        const nextDate = new Date();
        switch (interval) {
          case '4_weeks': nextDate.setDate(nextDate.getDate() + 28); break;
          case '6_weeks': nextDate.setDate(nextDate.getDate() + 42); break;
          case 'quarterly': nextDate.setMonth(nextDate.getMonth() + 3); break;
          default: nextDate.setMonth(nextDate.getMonth() + 1);
        }
        try {
          await fetch('/api/recurring', { method: 'PATCH', headers, body: JSON.stringify({
            quote_id: createdQuote.id, recurring_enabled: true, recurring_interval: interval,
            next_service_date: nextDate.toISOString().split('T')[0],
          }) });
        } catch {}
      }

      // Save contacts
      const finalCustId = effectiveCustomerId || sendResult.customer_id;
      if (finalCustId && (pocName || emergencyName)) {
        try {
          await fetch(`/api/customers/${finalCustId}`, { method: 'PATCH', headers, body: JSON.stringify({
            poc_name: pocName || null, poc_phone: pocPhone || null, poc_email: pocEmail || null, poc_role: pocRole || null,
            emergency_contact_name: emergencyName || null, emergency_contact_phone: emergencyPhone || null, contact_notes: contactNotes || null,
          }) });
        } catch {}
      }

      if (sendResult.emailSent === false && sendResult.emailError) {
        toastError(`Email failed: ${sendResult.emailError}`);
      } else {
        toastSuccess(`Quote sent to ${effectiveEmail}`);
      }
      if (onSuccess) onSuccess(); else onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com';
  const pdfUrl = createdQuote ? `/api/quotes/${createdQuote.id}/pdf?shareToken=${createdQuote.share_link}` : null;
  const quoteLink = createdQuote ? `${appUrl}/q/${createdQuote.share_link}` : '';

  // ─── STEP 2: Email Compose + Quote Preview ───
  if (step === 2 && createdQuote) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-[#0f1623] border border-white/[0.08] rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
              </div>
              <div>
                <h2 className="text-white font-semibold text-base">Send Quote to Client</h2>
                <p className="text-gray-400 text-xs mt-0.5">
                  {aircraftName}{quote?.tailNumber ? ` · ${quote.tailNumber}` : ''} · {currencySymbol()}{formatPrice(totalPrice)}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-lg px-2">&times;</button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {/* Email Compose */}
            <div className="p-6 space-y-4">
              {error && <p className="text-red-400 text-sm">{error}</p>}

              {/* To field */}
              <div>
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider block mb-1.5">To</label>
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                  <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {(effectiveName || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{effectiveName}</p>
                    <p className="text-gray-400 text-xs truncate">{effectiveEmail}</p>
                  </div>
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider block mb-1.5">Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg text-white text-sm outline-none focus:ring-1 focus:ring-blue-500 bg-white/[0.04] border border-white/[0.08]"
                />
              </div>

              {/* Message */}
              <div>
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider block mb-1.5">Message</label>
                <textarea
                  value={emailBody}
                  onChange={e => setEmailBody(e.target.value)}
                  rows={7}
                  className="w-full px-4 py-3 rounded-lg text-white text-sm outline-none focus:ring-1 focus:ring-blue-500 resize-none leading-relaxed bg-white/[0.04] border border-white/[0.08]"
                />
              </div>

              {/* Quote link */}
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Quote link (included in email)</p>
                <div className="flex items-center gap-2">
                  <a href={quoteLink} target="_blank" rel="noreferrer" className="text-v-gold text-xs hover:underline truncate flex-1">{quoteLink}</a>
                  <button onClick={() => { navigator.clipboard.writeText(quoteLink).catch(() => {}); toastSuccess('Link copied'); }}
                    className="text-[10px] text-gray-400 hover:text-white border border-white/[0.08] rounded px-2 py-1 shrink-0">
                    Copy
                  </button>
                </div>
              </div>

              {/* Schedule Send */}
              <div className="border-t border-white/[0.08] pt-3">
                <label className="flex items-center cursor-pointer">
                  <input type="checkbox" checked={isScheduled} onChange={e => { setIsScheduled(e.target.checked); if (!e.target.checked) setScheduledDate(""); }}
                    className="mr-2 w-4 h-4 text-v-gold" />
                  <span className="text-sm font-medium text-white">Schedule for later</span>
                </label>
                {isScheduled && (
                  <div className="mt-2 pl-6">
                    <input type="datetime-local" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
                      min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                      className="w-full border border-white/[0.08] bg-white/[0.04] text-white rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                      style={{ colorScheme: 'dark' }} />
                  </div>
                )}
              </div>

              {/* Recurring */}
              <div className="border-t border-white/[0.08] pt-3">
                <label className="flex items-center cursor-pointer">
                  <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)}
                    className="mr-2 w-4 h-4 text-v-gold" />
                  <span className="text-sm font-medium text-white">Set up as recurring service</span>
                </label>
                {isRecurring && (
                  <div className="mt-2 pl-6">
                    <select value={recurringInterval} onChange={e => setRecurringInterval(e.target.value)}
                      className="w-full border border-white/[0.08] bg-white/[0.04] text-white rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                      style={{ colorScheme: 'dark' }}>
                      <option value="4_weeks">Every 4 weeks (Recommended)</option>
                      <option value="monthly">Monthly</option>
                      <option value="6_weeks">Every 6 weeks</option>
                      <option value="quarterly">Quarterly</option>
                    </select>
                    {recurringInterval === "4_weeks" && (
                      <p className="text-xs text-v-gold/80 mt-1">13 cycles/year vs 12 months = 8% more annual revenue.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Collapsible Quote Preview */}
            <button
              onClick={() => setPreviewOpen(p => !p)}
              className="w-full flex items-center gap-3 px-6 py-3 hover:bg-white/5 transition-colors border-t border-white/[0.08]"
              style={{ borderBottom: previewOpen ? '1px solid rgba(255,255,255,0.08)' : 'none' }}
            >
              <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Quote Preview — As Client Sees It</span>
              <span className="ml-auto text-gray-500">
                <svg className={`w-3.5 h-3.5 transition-transform ${previewOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>
              </span>
            </button>
            {previewOpen && (
              <div className="bg-gray-900">
                <iframe
                  src={pdfUrl}
                  className="w-full border-0"
                  title="Quote Preview"
                  style={{ height: '500px' }}
                />
                <div className="px-6 py-2 flex items-center justify-between border-t border-white/[0.06]">
                  <a href={pdfUrl} download={`quote-${createdQuote.id.slice(0, 8)}.pdf`}
                    className="text-xs text-gray-500 hover:text-v-gold transition-colors">
                    Download PDF
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Footer: Cancel | Save Draft | Send */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.08] bg-[#0d1520] shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
              Cancel
            </button>
            <div className="flex items-center gap-3">
              <button onClick={handleSaveDraft} disabled={draftLoading}
                className="px-4 py-2.5 text-sm text-gray-300 hover:text-white border border-white/[0.08] rounded-lg transition-colors disabled:opacity-50">
                {draftLoading ? 'Saving...' : 'Save as Draft'}
              </button>
              <button
                onClick={handleSendQuote}
                disabled={loading}
                className="px-6 py-2.5 text-sm font-semibold text-white rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
                )}
                {loading ? (isScheduled ? 'Scheduling...' : 'Sending...') : (isScheduled && scheduledDate ? 'Schedule Quote' : 'Send Quote')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── STEP 1: Customer Selection ───
  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50">
      <div className="modal-content bg-v-surface text-white border border-v-border rounded-t-2xl sm:rounded-lg p-4 sm:p-6 w-full sm:max-w-md overflow-y-auto max-h-[95vh] sm:max-h-[90vh]">
        <div>
            <h2 className="text-xl font-semibold mb-2">Send to Client</h2>
            <p className="mb-4 text-v-text-secondary">
              {aircraftName && `Aircraft: ${aircraftName}`}{quote?.airport ? ` • ${quote.airport}` : ''} • Total: {currencySymbol()}{formatPrice(totalPrice)}
            </p>
            {error && <p className="text-red-400 mb-2">{error}</p>}

            {/* Quote Limit Upgrade Prompt */}
            {quoteLimitHit && (
              <div className="bg-v-gold/10 border border-v-gold/30 rounded-lg p-4 mb-4">
                <p className="font-semibold text-v-gold mb-1">Quote limit reached this month</p>
                <p className="text-sm text-v-gold/80 mb-3">
                  You&apos;ve used {quoteLimitHit.quotesUsed}/{quoteLimitHit.quotesLimit} free quotes this month.
                  Upgrade to Pro for unlimited quotes.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={async () => {
                      try {
                        const token = localStorage.getItem("vector_token");
                        const res = await fetch("/api/upgrade", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ tier: "pro" }),
                        });
                        const data = await res.json();
                        if (data.url) window.location.href = data.url;
                        else if (data.error) setError(data.error);
                      } catch (e) { setError("Failed to start upgrade"); }
                    }}
                    className="w-full px-4 py-2 rounded bg-v-gold hover:bg-v-gold-dim text-white font-semibold"
                  >
                    Upgrade to Pro - $79/mo
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const token = localStorage.getItem("vector_token");
                        const res = await fetch("/api/upgrade", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ tier: "business" }),
                        });
                        const data = await res.json();
                        if (data.url) window.location.href = data.url;
                        else if (data.error) setError(data.error);
                      } catch (e) { setError("Failed to start upgrade"); }
                    }}
                    className="w-full px-4 py-2 rounded bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold hover:opacity-90"
                  >
                    Upgrade to Business - $149/mo
                  </button>
                </div>
              </div>
            )}

            {/* Customer Selection */}
            <label className="block mb-2 text-sm font-medium text-v-text-secondary">Customer</label>
            {customerLocked && selectedCustomer ? (
              <div className="mb-3 p-3 bg-v-surface-light/30 border border-v-border rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{selectedCustomer.name}</p>
                  <p className="text-xs text-v-text-secondary">{selectedCustomer.email}</p>
                </div>
                <span className="text-xs text-v-text-secondary bg-v-surface-light/30 px-2 py-1 rounded">Pre-selected</span>
              </div>
            ) : (
              <CustomerSelector
                customerMode={customerMode}
                onModeChange={setCustomerMode}
                selectedCustomer={selectedCustomer}
                onSelect={handleCustomerSelect}
                onClear={handleCustomerClear}
                newCustomerFields={newCustomerFields}
                onFieldChange={handleNewCustomerFieldChange}
              />
            )}

            {/* Contact Information */}
            <div className="mb-3">
              <button type="button" onClick={() => setShowContacts(!showContacts)}
                className="w-full flex items-center justify-between text-sm font-medium text-v-text-secondary py-2 px-3 bg-v-surface-light/30 rounded-lg hover:bg-v-surface-light/30">
                <span>Aircraft Contact Info {(pocName || emergencyName) && <span className="text-green-400 ml-1">&#10003;</span>}</span>
                <span className="text-v-text-secondary">{showContacts ? '\u25B2' : '\u25BC'}</span>
              </button>
              {showContacts && (
                <div className="mt-2 space-y-3 p-3 border border-v-border rounded-lg bg-v-surface-light/30">
                  <div>
                    <p className="text-xs font-semibold text-v-text-secondary uppercase tracking-wider mb-2">Who should we contact about this aircraft?</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" value={pocName} onChange={e => setPocName(e.target.value)} placeholder="Contact name"
                        className="col-span-2 border border-v-border bg-v-surface-light/30 text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:border-v-gold focus:ring-0 outline-none" />
                      <PhoneInput value={pocPhone} onChange={val => setPocPhone(val)} placeholder="Phone"
                        className="border border-v-border bg-v-surface-light/30 rounded-lg px-3 py-2 text-sm focus-within:border-v-gold" />
                      <input type="email" value={pocEmail} onChange={e => setPocEmail(e.target.value)} placeholder="Email"
                        className="border border-v-border bg-v-surface-light/30 text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:border-v-gold focus:ring-0 outline-none" />
                    </div>
                    <select value={pocRole} onChange={e => setPocRole(e.target.value)}
                      className="mt-2 w-full border border-v-border bg-v-surface-light/30 text-white rounded-lg px-3 py-2 text-sm focus:border-v-gold outline-none"
                      style={{ colorScheme: 'dark' }}>
                      <option value="">Select role...</option>
                      <option value="Owner">Owner</option>
                      <option value="Pilot">Pilot</option>
                      <option value="Manager">Manager</option>
                      <option value="Assistant">Assistant</option>
                      <option value="FBO">FBO</option>
                    </select>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-v-text-secondary uppercase tracking-wider mb-2">Emergency contact for day of service</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" value={emergencyName} onChange={e => setEmergencyName(e.target.value)} placeholder="Emergency contact name"
                        className="border border-v-border bg-v-surface-light/30 text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:border-v-gold focus:ring-0 outline-none" />
                      <PhoneInput value={emergencyPhone} onChange={val => setEmergencyPhone(val)} placeholder="Emergency phone"
                        className="border border-v-border bg-v-surface-light/30 rounded-lg px-3 py-2 text-sm focus-within:border-v-gold" />
                    </div>
                  </div>
                  <textarea value={contactNotes} onChange={e => setContactNotes(e.target.value)}
                    placeholder="Contact notes (e.g., best time to call, gate access code...)" rows={2}
                    className="w-full border border-v-border bg-v-surface-light/30 text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:border-v-gold focus:ring-0 outline-none resize-none" />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-4">
              <button type="button" onClick={onClose} disabled={loading || draftLoading}
                className="px-4 py-3 border border-v-border rounded-lg text-v-text-secondary hover:bg-v-surface-light/30 min-h-[44px] font-medium">
                Cancel
              </button>
              <button type="button" onClick={handleSaveAndReview} disabled={loading || draftLoading}
                className="px-4 py-3 rounded-lg bg-v-gold hover:bg-v-gold-dim text-white disabled:opacity-50 min-h-[44px] font-medium flex items-center justify-center gap-2">
                {loading && <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                {loading ? 'Saving...' : 'Save & Review'}
              </button>
              <button type="button" onClick={handleSaveDraft} disabled={loading || draftLoading}
                className="px-4 py-3 rounded-lg border border-v-gold/30 text-v-gold hover:bg-v-gold/10 disabled:opacity-50 min-h-[44px] font-medium flex items-center justify-center gap-2">
                {draftLoading ? 'Saving...' : 'Save as Draft'}
              </button>
            </div>
          </div>
      </div>
    </div>
  );
}
