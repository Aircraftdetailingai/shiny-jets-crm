"use client";
import { useState, useEffect } from "react";
import CustomerSelector from "./CustomerSelector";
import { formatPrice, currencySymbol } from "@/lib/formatPrice";
import { useToast } from "./Toast";

export default function SendQuoteModal({ isOpen, onClose, onSuccess, quote, user, preselectedCustomer }) {
  const { success: toastSuccess, error: toastError } = useToast();
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
  const [method, setMethod] = useState("link"); // 'link', 'email' (SMS disabled pending 10DLC approval)
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [error, setError] = useState("");
  const [quoteLimitHit, setQuoteLimitHit] = useState(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringInterval, setRecurringInterval] = useState("4_weeks"); // '4_weeks', 'monthly', 'quarterly'
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");

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

  // Close when not open
  if (!isOpen) return null;

  const ADMIN_EMAILS = ['brett@vectorav.ai', 'admin@vectorav.ai'];
  const isBusiness = user?.plan === "business" || user?.plan === "enterprise" || user?.is_admin || ADMIN_EMAILS.includes(user?.email?.toLowerCase());
  // SMS disabled pending 10DLC approval
  const requiresSms = false;
  const requiresEmail = method === "email";

  const totalPrice = parseFloat(quote?.totalPrice) || 0;
  const aircraftName = quote?.aircraft?.name || "";

  // Derive client fields from customer selection or new customer form
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
    // Auto-fill contact info from saved customer
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
    setClientName("");
    setClientEmail("");
    setClientPhone("");
    setClientCompany("");
    setNewCustomerFields({ name: "", email: "", phone: "", companyName: "" });
    setPocName(""); setPocPhone(""); setPocEmail(""); setPocRole("");
    setEmergencyName(""); setEmergencyPhone(""); setContactNotes("");
    setShowContacts(false);
  };

  const handleNewCustomerFieldChange = (updates) => {
    setNewCustomerFields((prev) => ({ ...prev, ...updates }));
    // Sync to clientName/Email/Phone for backward compat
    if (updates.name !== undefined) setClientName(updates.name);
    if (updates.email !== undefined) setClientEmail(updates.email);
    if (updates.phone !== undefined) setClientPhone(updates.phone);
    if (updates.companyName !== undefined) setClientCompany(updates.companyName);
  };

  const createQuoteIfNeeded = async (custId) => {
    // If quote already has id and share_link, return
    if (quote?.id && quote?.share_link) {
      return { id: quote.id, share_link: quote.share_link };
    }

    // Use line items already computed by dashboard (not rebuilt from scratch)
    const lineItems = quote?.lineItems || (quote?.selectedServices || []).map(svc => ({
      service_id: svc.id,
      description: svc.name,
      hours: 0,
      amount: 0,
    }));

    // Build payload from quote prop
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
      customer_id: custId || effectiveCustomerId,
      customer_phone: effectivePhone || null,
      customer_company: effectiveCompany || null,
      airport: quote?.airport || null,
      tail_number: quote?.tailNumber || null,
      product_estimates: quote?.productEstimates || [],
      linked_products: quote?.linkedProducts || [],
      linked_equipment: quote?.linkedEquipment || [],
      poc_name: pocName || null,
      poc_phone: pocPhone || null,
      poc_email: pocEmail || null,
      poc_role: pocRole || null,
      emergency_contact_name: emergencyName || null,
      emergency_contact_phone: emergencyPhone || null,
      contact_notes: contactNotes || null,
    };

    console.log('Creating quote with payload:', JSON.stringify({
      aircraft_type: payload.aircraft_type,
      aircraft_model: payload.aircraft_model,
      total_price: payload.total_price,
      selected_services_count: payload.selected_services.length,
      line_items_count: payload.line_items.length,
    }));

    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("vector_token")}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      console.error('Quote create failed:', res.status, errData);
      if (res.status === 403 && errData?.upgrade) {
        setQuoteLimitHit(errData);
        throw new Error("QUOTE_LIMIT");
      }
      throw new Error(errData?.error || 'Failed to create');
    }
    const data = await res.json();
    return { id: data.id, share_link: data.share_link };
  };

  const handleSend = async () => {
    setError("");
    setLoading(true);
    try {
      // Validate fields
      if (!effectiveName) {
        throw new Error("Customer name is required");
      }
      if (!effectiveEmail) {
        throw new Error("Customer email is required");
      }
      // SMS disabled pending 10DLC approval

      // Always save/upsert customer FIRST so we have a customer_id
      let resolvedCustomerId = effectiveCustomerId;
      if (!resolvedCustomerId && effectiveEmail) {
        try {
          const custRes = await fetch("/api/customers", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("vector_token")}`,
            },
            body: JSON.stringify({
              name: effectiveName,
              email: effectiveEmail,
              phone: effectivePhone || null,
              company_name: effectiveCompany || null,
            }),
          });
          if (!custRes.ok) {
            const errData = await custRes.json().catch(() => null);
            console.error('Customer save failed:', custRes.status, errData);
            toastError(`Customer save failed: ${errData?.error || 'Unknown error'}`);
          } else {
            const custData = await custRes.json();
            if (custData.customer?.id) {
              resolvedCustomerId = custData.customer.id;
            } else {
              console.warn('Customer save returned no ID:', custData);
            }
          }
        } catch (e) {
          console.error('Customer pre-save failed:', e);
          toastError('Could not save customer record');
        }
      }

      // Create quote if needed
      const { id, share_link } = await createQuoteIfNeeded(resolvedCustomerId);

      // If scheduling for later, save to scheduled_quotes instead of sending now
      if (isScheduled && scheduledDate) {
        const sendTime = new Date(scheduledDate);
        if (sendTime <= new Date()) {
          throw new Error("Scheduled time must be in the future");
        }
        const schedRes = await fetch("/api/scheduled-quotes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("vector_token")}`,
          },
          body: JSON.stringify({
            quote_id: id,
            send_at: sendTime.toISOString(),
            client_name: effectiveName,
            client_email: effectiveEmail,
            client_phone: effectivePhone || null,
            client_company: effectiveCompany || null,
            customer_id: resolvedCustomerId,
            airport: quote?.airport || null,
          }),
        });
        if (!schedRes.ok) {
          const schedData = await schedRes.json().catch(() => null);
          throw new Error(schedData?.error || "Failed to schedule quote");
        }
        toastSuccess(`Quote scheduled for ${sendTime.toLocaleString()}`);
        setLoading(false);
        if (onSuccess) { onSuccess(); } else { onClose(); }
        return;
      }

      // Build send payload
      const sendPayload = {
        clientName: effectiveName,
        clientEmail: effectiveEmail,
        clientCompany: effectiveCompany || null,
        customerId: resolvedCustomerId,
        airport: quote?.airport || null,
      };
      if (effectivePhone) {
        sendPayload.clientPhone = effectivePhone;
      }
      const res = await fetch(`/api/quotes/${id}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("vector_token")}`,
        },
        body: JSON.stringify(sendPayload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to send');
      }
      const sendResult = await res.json();

      // Set up recurring if selected
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
          await fetch('/api/recurring', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('vector_token')}`,
            },
            body: JSON.stringify({
              quote_id: id,
              recurring_enabled: true,
              recurring_interval: interval,
              next_service_date: nextDate.toISOString().split('T')[0],
            }),
          });
        } catch (recurErr) {
          console.error('Failed to set recurring:', recurErr);
        }
      }

      // Save contact info to customer profile for reuse
      const finalCustomerId = resolvedCustomerId || sendResult.customer_id;
      if (finalCustomerId && (pocName || emergencyName)) {
        try {
          await fetch(`/api/customers/${finalCustomerId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('vector_token')}`,
            },
            body: JSON.stringify({
              poc_name: pocName || null,
              poc_phone: pocPhone || null,
              poc_email: pocEmail || null,
              poc_role: pocRole || null,
              emergency_contact_name: emergencyName || null,
              emergency_contact_phone: emergencyPhone || null,
              contact_notes: contactNotes || null,
            }),
          });
        } catch (e) {
          console.error('Failed to save contacts to customer:', e);
        }
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.vectorav.ai';
      const link = `${appUrl}/q/${share_link}`;

      // Show warnings for any delivery failures
      const warnings = [];
      if (requiresEmail && sendResult.emailSent === false && sendResult.emailError) {
        warnings.push(`Email failed: ${sendResult.emailError}`);
      }
      // SMS disabled pending 10DLC approval
      if (warnings.length > 0) {
        toastError(warnings.join('. '));
      }

      // Method-aware success message
      const successMsg = method === 'email'
        ? 'Email sent!'
        : 'Quote link copied!';
      toastSuccess(successMsg);

      // Copy link for 'link' method
      if (method === 'link') {
        try { await navigator.clipboard.writeText(link); } catch {}
      }

      // Auto-close modal and reset
      if (onSuccess) {
        onSuccess();
      } else {
        onClose();
      }
    } catch (err) {
      if (err.message !== "QUOTE_LIMIT") {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    setError("");
    setDraftLoading(true);
    try {
      // Validate name and email
      if (!effectiveName) {
        throw new Error("Customer name is required");
      }
      if (!effectiveEmail) {
        throw new Error("Customer email is required");
      }

      const token = localStorage.getItem("vector_token");

      // Save/upsert customer first to get an ID
      let draftCustomerId = effectiveCustomerId;
      if (effectiveEmail) {
        try {
          const custRes = await fetch("/api/customers", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              name: effectiveName,
              email: effectiveEmail,
              phone: effectivePhone || null,
              company_name: effectiveCompany || null,
            }),
          });
          if (!custRes.ok) {
            const errData = await custRes.json().catch(() => null);
            console.error('Customer save in draft failed:', custRes.status, errData);
            toastError(`Customer save failed: ${errData?.error || 'Unknown error'}`);
          } else {
            const custData = await custRes.json();
            if (custData.customer?.id) {
              draftCustomerId = custData.customer.id;
            } else {
              console.warn('Draft customer save returned no ID:', custData);
            }
          }
        } catch (e) {
          console.error('Customer save in draft failed:', e);
          toastError('Could not save customer record');
        }
      }

      // Create quote as draft
      const { id, share_link } = await createQuoteIfNeeded(draftCustomerId);

      // Update quote with client info (stays as draft)
      await fetch(`/api/quotes/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          client_name: effectiveName,
          client_email: effectiveEmail,
          client_phone: effectivePhone || null,
          customer_id: draftCustomerId,
          airport: quote?.airport || null,
        }),
      });

      // Save contact info to customer profile
      if (draftCustomerId && (pocName || emergencyName)) {
        try {
          await fetch(`/api/customers/${draftCustomerId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              poc_name: pocName || null,
              poc_phone: pocPhone || null,
              poc_email: pocEmail || null,
              poc_role: pocRole || null,
              emergency_contact_name: emergencyName || null,
              emergency_contact_phone: emergencyPhone || null,
              contact_notes: contactNotes || null,
            }),
          });
        } catch (e) {
          console.error('Failed to save contacts to customer:', e);
        }
      }

      toastSuccess("Quote saved as draft!");

      // Auto-close modal and reset
      if (onSuccess) {
        onSuccess();
      } else {
        onClose();
      }
    } catch (err) {
      if (err.message !== "QUOTE_LIMIT") {
        setError(err.message);
      }
    } finally {
      setDraftLoading(false);
    }
  };

  // Render send method options
  const renderMethodOption = (value, label, locked) => {
    const isSelected = method === value;
    return (
      <div
        onClick={() => {
          if (locked) return;
          setMethod(value);
        }}
        className={`cursor-pointer border rounded p-3 flex items-center justify-between mb-2 ${
          locked ? "opacity-60" : ""
        } ${isSelected ? "border-amber-500 bg-amber-500/10" : "border-white/10"}`}
      >
        <span className="text-white">{label}</span>
        {locked && (
          <a
            href="/settings?upgrade=business"
            onClick={(e) => e.stopPropagation()}
            className="text-xs px-2 py-1 rounded bg-gradient-to-r from-amber-500 to-amber-600 text-white font-medium hover:opacity-90"
          >
            Upgrade — $149/mo
          </a>
        )}
      </div>
    );
  };

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50">
      <div className="modal-content bg-[#111827] text-white border border-white/10 rounded-t-2xl sm:rounded-lg p-5 sm:p-6 w-full sm:max-w-md overflow-y-auto max-h-[95vh] sm:max-h-[90vh]">
        <div>
            <h2 className="text-xl font-semibold mb-2">{'Send to Client'}</h2>
            <p className="mb-4 text-gray-400">
              {aircraftName && `${'Aircraft'}: ${aircraftName}`}{quote?.airport ? ` • ${quote.airport}` : ''} • {'Total'}: {currencySymbol()}{formatPrice(totalPrice)}
            </p>
            {error && <p className="text-red-400 mb-2">{error}</p>}

            {/* Quote Limit Upgrade Prompt */}
            {quoteLimitHit && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4">
                <p className="font-semibold text-amber-400 mb-1">{'Quote limit reached this month'}</p>
                <p className="text-sm text-amber-300 mb-3">
                  You&apos;ve used {quoteLimitHit.quotesUsed} of {quoteLimitHit.quotesLimit} free quotes this month.
                  {'Upgrade for Unlimited'}.
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
                    className="w-full px-4 py-2 rounded bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold hover:opacity-90"
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
            <label className="block mb-2 text-sm font-medium text-gray-300">{'Customer'}</label>
            {customerLocked && selectedCustomer ? (
              <div className="mb-3 p-3 bg-white/5 border border-white/10 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{selectedCustomer.name}</p>
                  <p className="text-xs text-gray-400">{selectedCustomer.email}</p>
                </div>
                <span className="text-xs text-gray-500 bg-white/10 px-2 py-1 rounded">Pre-selected</span>
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
              <button
                type="button"
                onClick={() => setShowContacts(!showContacts)}
                className="w-full flex items-center justify-between text-sm font-medium text-gray-300 py-2 px-3 bg-white/5 rounded-lg hover:bg-white/10"
              >
                <span>Aircraft Contact Info {(pocName || emergencyName) && <span className="text-green-400 ml-1">&#10003;</span>}</span>
                <span className="text-gray-500">{showContacts ? '\u25B2' : '\u25BC'}</span>
              </button>
              {showContacts && (
                <div className="mt-2 space-y-3 p-3 border border-white/10 rounded-lg bg-white/5">
                  {/* POC Section */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Who should we contact about this aircraft?</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={pocName}
                        onChange={(e) => setPocName(e.target.value)}
                        placeholder="Contact name"
                        className="col-span-2 border border-white/10 bg-white/5 text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      />
                      <input
                        type="tel"
                        value={pocPhone}
                        onChange={(e) => setPocPhone(e.target.value)}
                        placeholder={'Phone'}
                        className="border border-white/10 bg-white/5 text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      />
                      <input
                        type="email"
                        value={pocEmail}
                        onChange={(e) => setPocEmail(e.target.value)}
                        placeholder={'Email'}
                        className="border border-white/10 bg-white/5 text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      />
                    </div>
                    <select
                      value={pocRole}
                      onChange={(e) => setPocRole(e.target.value)}
                      className="mt-2 w-full border border-white/10 bg-white/5 text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    >
                      <option value="">Select role...</option>
                      <option value="Owner">Owner</option>
                      <option value="Pilot">Pilot</option>
                      <option value="Manager">Manager</option>
                      <option value="Assistant">Assistant</option>
                      <option value="FBO">FBO</option>
                    </select>
                  </div>

                  {/* Emergency Contact */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Emergency contact for day of service</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={emergencyName}
                        onChange={(e) => setEmergencyName(e.target.value)}
                        placeholder="Emergency contact name"
                        className="border border-white/10 bg-white/5 text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      />
                      <input
                        type="tel"
                        value={emergencyPhone}
                        onChange={(e) => setEmergencyPhone(e.target.value)}
                        placeholder="Emergency phone"
                        className="border border-white/10 bg-white/5 text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <textarea
                      value={contactNotes}
                      onChange={(e) => setContactNotes(e.target.value)}
                      placeholder="Contact notes (e.g., best time to call, gate access code...)"
                      rows={2}
                      className="w-full border border-white/10 bg-white/5 text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Method selection */}
            <div className="mb-3">
              {renderMethodOption("link", "Copy link only", false)}
              {renderMethodOption("email", "Send via Email", false)}
            </div>

            {/* Schedule Send Option */}
            <div className="mb-3 border-t border-white/10 pt-3">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isScheduled}
                  onChange={(e) => { setIsScheduled(e.target.checked); if (!e.target.checked) setScheduledDate(""); }}
                  className="mr-2 w-4 h-4 text-amber-500"
                />
                <span className="text-sm font-medium">Schedule for later</span>
              </label>
              {isScheduled && (
                <div className="mt-2 pl-6">
                  <input
                    type="datetime-local"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                    className="w-full border border-white/10 bg-white/5 text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">Quote will be sent automatically at this time.</p>
                </div>
              )}
            </div>

            {/* Recurring Service Option */}
            <div className="mb-3 border-t border-white/10 pt-3">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="mr-2 w-4 h-4 text-amber-500"
                />
                <span className="text-sm font-medium">Set up as recurring service</span>
              </label>

              {isRecurring && (
                <div className="mt-3 pl-6">
                  <label className="block mb-2 text-sm font-medium text-gray-300">{'Frequency'}</label>
                  <select
                    value={recurringInterval}
                    onChange={(e) => setRecurringInterval(e.target.value)}
                    className="w-full border border-white/10 bg-white/5 text-white rounded px-3 py-2 mb-2"
                  >
                    <option value="4_weeks">{'Every 4 weeks'} (Recommended)</option>
                    <option value="monthly">{'Monthly'}</option>
                    <option value="6_weeks">{'Every 6 weeks'}</option>
                    <option value="quarterly">{'Quarterly'}</option>
                  </select>

                  {recurringInterval === "4_weeks" && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2 text-xs text-amber-300">
                      <span className="font-semibold">Smart choice!</span> Billing every 4 weeks = 13 cycles/year vs 12 months = 8% more annual revenue.
                    </div>
                  )}
                  {recurringInterval === "monthly" && (
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded p-2 text-xs text-blue-400">
                      <span className="font-semibold">Tip:</span> Consider 4-week billing for 8% more annual revenue. Most customers won't notice the difference!
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={loading || draftLoading}
                className="px-4 py-3 border border-white/10 rounded-lg text-gray-300 hover:bg-white/5 min-h-[44px] font-medium"
              >
                {'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={loading || draftLoading}
                className="px-4 py-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white disabled:opacity-50 min-h-[44px] font-medium flex items-center justify-center gap-2"
              >
                {loading && <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                {loading ? (isScheduled ? 'Scheduling...' : 'Sending...') : (isScheduled && scheduledDate ? 'Schedule Quote' : 'Save & Send Quote')}
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={loading || draftLoading}
                className="px-4 py-3 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50 min-h-[44px] font-medium flex items-center justify-center gap-2"
              >
                {draftLoading ? 'Saving...' : 'Save as Draft'}
              </button>
            </div>
          </div>
      </div>
    </div>
  );
}
