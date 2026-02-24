"use client";
import { useState, useEffect } from "react";
import CustomerSelector from "./CustomerSelector";

export default function SendQuoteModal({ isOpen, onClose, quote, user }) {
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
  const [method, setMethod] = useState("link"); // 'link', 'sms', 'email', 'both'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [quoteLink, setQuoteLink] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringInterval, setRecurringInterval] = useState("4_weeks"); // '4_weeks', 'monthly', 'quarterly'

  // Close when not open
  if (!isOpen) return null;

  const isBusiness = user?.plan === "business" || user?.plan === "enterprise" || user?.is_admin;
  const requiresSms = method === "sms" || method === "both";
  const requiresEmail = method === "email" || method === "both";

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
  };

  const handleCustomerClear = () => {
    setSelectedCustomer(null);
    setClientName("");
    setClientEmail("");
    setClientPhone("");
    setClientCompany("");
    setNewCustomerFields({ name: "", email: "", phone: "", companyName: "" });
  };

  const handleNewCustomerFieldChange = (updates) => {
    setNewCustomerFields((prev) => ({ ...prev, ...updates }));
    // Sync to clientName/Email/Phone for backward compat
    if (updates.name !== undefined) setClientName(updates.name);
    if (updates.email !== undefined) setClientEmail(updates.email);
    if (updates.phone !== undefined) setClientPhone(updates.phone);
    if (updates.companyName !== undefined) setClientCompany(updates.companyName);
  };

  const createQuoteIfNeeded = async () => {
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
      customer_id: effectiveCustomerId,
      customer_phone: effectivePhone || null,
      customer_company: effectiveCompany || null,
      airport: quote?.airport || null,
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
      throw new Error(errData?.error || "Failed to create quote");
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
      if (requiresSms && isBusiness && !effectivePhone) {
        throw new Error("Customer phone is required for SMS");
      }
      // Create quote if needed
      const { id, share_link } = await createQuoteIfNeeded();
      // Build send payload
      const sendPayload = {
        clientName: effectiveName,
        clientEmail: effectiveEmail,
        clientCompany: effectiveCompany || null,
        customerId: effectiveCustomerId,
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
        throw new Error(data?.error || "Failed to send quote");
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

      // Warn if email failed but quote was sent
      if (sendResult.emailError) {
        console.error('Email send failed:', sendResult.emailError);
      }
      // success
      const link = `${window.location.origin}/q/${share_link}`;
      setQuoteLink(link);
      setSuccess(true);
      if (sendResult.emailSent === false && sendResult.emailError) {
        setError(`Quote sent but email failed: ${sendResult.emailError}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(quoteLink);
    } catch (e) {
      console.error("Failed to copy", e);
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
          locked ? "opacity-50" : ""
        } ${isSelected ? "border-amber-500" : "border-gray-300"}`}
      >
        <span>{label}</span>
        {locked && <span className="text-sm text-gray-500">Business Plan</span>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md overflow-y-auto max-h-[90vh]">
        {!success ? (
          <div>
            <h2 className="text-xl font-semibold mb-2">Send Quote to Client</h2>
            <p className="mb-4 text-gray-600">
              {aircraftName && `Aircraft: ${aircraftName}`}{quote?.airport ? ` • ${quote.airport}` : ''} • Total: ${totalPrice.toFixed(2)}
            </p>
            {error && <p className="text-red-600 mb-2">{error}</p>}

            {/* Customer Selection */}
            <label className="block mb-2 text-sm font-medium">Customer</label>
            <CustomerSelector
              customerMode={customerMode}
              onModeChange={setCustomerMode}
              selectedCustomer={selectedCustomer}
              onSelect={handleCustomerSelect}
              onClear={handleCustomerClear}
              newCustomerFields={newCustomerFields}
              onFieldChange={handleNewCustomerFieldChange}
            />

            {/* Method selection */}
            <div className="mb-3">
              {renderMethodOption("link", "Copy link only", false)}
              {renderMethodOption(
                "sms",
                "Send via SMS",
                !isBusiness
              )}
              {renderMethodOption("email", "Send via Email", false)}
              {renderMethodOption(
                "both",
                "Send SMS + Email",
                !isBusiness
              )}
            </div>
            {/* Inputs based on method */}
            {requiresSms && !isBusiness && (
              <div className="bg-yellow-100 p-3 rounded mb-3 text-sm">
                Want us to text it for you?{' '}
                <a
                  href="/settings?upgrade=business"
                  className="text-blue-600 underline"
                >
                  Upgrade to Business
                </a>
              </div>
            )}
            {requiresSms && isBusiness && !effectivePhone && (
              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded mb-3 text-sm text-yellow-800">
                Add a phone number above to send via SMS.
              </div>
            )}
            {requiresSms && isBusiness && effectiveName && effectivePhone && (
              <div className="mb-3">
                <div className="bg-green-100 text-green-800 p-3 rounded text-sm whitespace-pre-line">
                  {`Hi ${effectiveName}, here's your quote for the ${aircraftName} detail:\n${quoteLink || '[link will appear after sending]'}\nTotal: $${totalPrice.toFixed(2)}\n- ${user?.name || ''}, ${user?.company || ''}`}
                </div>
              </div>
            )}

            {/* Recurring Service Option */}
            <div className="mb-3 border-t pt-3">
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
                  <label className="block mb-2 text-sm font-medium">Billing Frequency</label>
                  <select
                    value={recurringInterval}
                    onChange={(e) => setRecurringInterval(e.target.value)}
                    className="w-full border rounded px-3 py-2 mb-2"
                  >
                    <option value="4_weeks">Every 4 weeks (Recommended)</option>
                    <option value="monthly">Monthly</option>
                    <option value="6_weeks">Every 6 weeks</option>
                    <option value="quarterly">Quarterly</option>
                  </select>

                  {recurringInterval === "4_weeks" && (
                    <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                      <span className="font-semibold">Smart choice!</span> Billing every 4 weeks = 13 cycles/year vs 12 months = 8% more annual revenue.
                    </div>
                  )}
                  {recurringInterval === "monthly" && (
                    <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-blue-700">
                      <span className="font-semibold">Tip:</span> Consider 4-week billing for 8% more annual revenue. Most customers won't notice the difference!
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 mt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border rounded text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={loading}
                className="px-4 py-2 rounded bg-gradient-to-r from-amber-500 to-amber-600 text-white disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-green-600 text-4xl mb-2">✓</div>
            <h2 className="text-xl font-semibold mb-2">Quote Sent!</h2>
            <p className="mb-3">
              <a
                href={quoteLink}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline break-words"
              >
                {quoteLink}
              </a>
              <button
                type="button"
                onClick={copyToClipboard}
                className="ml-2 text-sm text-blue-600 underline"
              >
                Copy
              </button>
            </p>
            <div className="text-left mb-4 text-sm">
              <p className="font-semibold mb-1">What happens next:</p>
              {isBusiness ? (
                <ul className="list-disc list-inside">
                  <li>Your client will receive the quote via SMS/Email.</li>
                  <li>We'll send follow-up reminders after 3 and 7 days.</li>
                  <li>You can track views and acceptance in your dashboard.</li>
                </ul>
              ) : (
                <ul className="list-disc list-inside">
                  <li>Share the link with your client.</li>
                  <li>Upgrade to Business to send SMS follow-ups automatically.</li>
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setSuccess(false);
                onClose();
              }}
              className="px-4 py-2 rounded bg-gradient-to-r from-amber-500 to-amber-600 text-white"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
