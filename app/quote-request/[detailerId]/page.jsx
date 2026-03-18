"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function QuoteRequestPage() {
  const params = useParams();
  const detailerId = params.detailerId;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [detailer, setDetailer] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    aircraft_type: '',
    aircraft_model: '',
    tail_number: '',
    location: '',
    services: [],
    notes: '',
    answers: {},
  });

  useEffect(() => {
    fetchDetailerInfo();
  }, [detailerId]);

  const fetchDetailerInfo = async () => {
    try {
      // Fetch detailer info and questions
      const res = await fetch(`/api/lead-intake/widget?detailer_id=${detailerId}`);
      if (res.ok) {
        const data = await res.json();
        setDetailer(data.detailer);
        setQuestions(data.questions || []);
      } else {
        setError('Detailer not found');
      }
    } catch (err) {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/lead-intake/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detailer_id: detailerId,
          customer_name: formData.name,
          customer_email: formData.email,
          customer_phone: formData.phone,
          answers: {
            aircraft_type: formData.aircraft_type,
            aircraft_model: formData.aircraft_model,
            tail_number: formData.tail_number,
            location: formData.location,
            services: formData.services,
            notes: formData.notes,
            ...formData.answers,
          },
          source: 'quote_request_page',
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to submit');
      }
    } catch (err) {
      setError('Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const aircraftTypes = [
    'Piston Single',
    'Piston Twin',
    'Turboprop',
    'Light Jet',
    'Midsize Jet',
    'Super Midsize Jet',
    'Large Cabin Jet',
    'Helicopter',
  ];

  const serviceOptions = [
    'Exterior Wash',
    'Interior Detail',
    'Full Detail (Interior + Exterior)',
    'Brightwork Polish',
    'Leather Conditioning',
    'Carpet Shampoo',
    'Engine Detail',
    'Other',
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-v-gold border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error && !detailer) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md text-center">
          <div className="text-green-500 text-5xl mb-4">&#10003;</div>
          <h2 className="text-2xl font-bold mb-2">Request Submitted!</h2>
          <p className="text-gray-600 mb-4">
            {detailer?.company_name || 'The detailer'} will contact you shortly with a quote.
          </p>
          <p className="text-sm text-gray-500">
            You can close this window.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center text-white mb-8 pt-8">
          <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
            <span>&#9992;</span> {detailer?.company_name || 'Request a Quote'}
          </h1>
          <p className="text-blue-200 mt-2">Aircraft Detailing Services</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-lg shadow-xl overflow-hidden">
          {/* Progress Steps */}
          <div className="flex border-b">
            {['Contact', 'Aircraft', 'Services'].map((label, idx) => (
              <div
                key={label}
                className={`flex-1 text-center py-3 text-sm font-medium ${
                  step === idx + 1
                    ? 'bg-v-gold text-white'
                    : step > idx + 1
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {label}
              </div>
            ))}
          </div>

          <div className="p-6">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Step 1: Contact Info */}
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold mb-4">Your Contact Information</h2>

                <div>
                  <label className="block text-sm font-medium mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="John Smith"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="john@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="(555) 123-4567"
                  />
                </div>

                <button
                  onClick={() => setStep(2)}
                  disabled={!formData.name || !formData.email}
                  className="w-full py-3 bg-v-gold text-white font-semibold rounded-lg hover:bg-v-gold-dim disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            )}

            {/* Step 2: Aircraft Info */}
            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold mb-4">Aircraft Information</h2>

                <div>
                  <label className="block text-sm font-medium mb-1">Aircraft Type *</label>
                  <select
                    value={formData.aircraft_type}
                    onChange={(e) => setFormData({ ...formData, aircraft_type: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Select type...</option>
                    {aircraftTypes.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Make & Model</label>
                  <input
                    type="text"
                    value={formData.aircraft_model}
                    onChange={(e) => setFormData({ ...formData, aircraft_model: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="e.g., Cessna Citation CJ3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Tail Number</label>
                  <input
                    type="text"
                    value={formData.tail_number}
                    onChange={(e) => setFormData({ ...formData, tail_number: e.target.value.toUpperCase() })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="N12345"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Location (Airport/FBO)</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="e.g., KJFK - Signature Flight Support"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!formData.aircraft_type}
                    className="flex-1 py-3 bg-v-gold text-white font-semibold rounded-lg hover:bg-v-gold-dim disabled:opacity-50"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Services */}
            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold mb-4">Services Needed</h2>

                <div>
                  <label className="block text-sm font-medium mb-2">Select services (check all that apply)</label>
                  <div className="space-y-2">
                    {serviceOptions.map((service) => (
                      <label key={service} className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={formData.services.includes(service)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({ ...formData, services: [...formData.services, service] });
                            } else {
                              setFormData({ ...formData, services: formData.services.filter(s => s !== service) });
                            }
                          }}
                          className="w-5 h-5 rounded text-v-gold mr-3"
                        />
                        {service}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Custom questions from detailer */}
                {questions.map((q) => (
                  <div key={q.id}>
                    <label className="block text-sm font-medium mb-1">
                      {q.question_text} {q.required && '*'}
                    </label>
                    {q.question_type === 'select' ? (
                      <select
                        value={formData.answers[q.question_key] || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          answers: { ...formData.answers, [q.question_key]: e.target.value }
                        })}
                        className="w-full border rounded-lg px-3 py-2"
                      >
                        <option value="">Select...</option>
                        {q.options?.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={formData.answers[q.question_key] || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          answers: { ...formData.answers, [q.question_key]: e.target.value }
                        })}
                        placeholder={q.placeholder}
                        className="w-full border rounded-lg px-3 py-2"
                      />
                    )}
                  </div>
                ))}

                <div>
                  <label className="block text-sm font-medium mb-1">Additional Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    rows={3}
                    placeholder="Any special requests or details..."
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || formData.services.length === 0}
                    className="flex-1 py-3 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 disabled:opacity-50"
                  >
                    {submitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-blue-200 text-sm mt-6">
          Powered by Vector
        </div>
      </div>
    </div>
  );
}
