"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function EmbedQuotePage() {
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
          source: 'embed_form',
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
  ];

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center bg-white">
        <div className="animate-spin w-8 h-8 border-4 border-v-gold border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error && !detailer) {
    return (
      <div className="min-h-[400px] flex items-center justify-center bg-white p-4">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-[400px] flex items-center justify-center bg-white p-8">
        <div className="text-center">
          <div className="text-green-500 text-5xl mb-4">&#10003;</div>
          <h2 className="text-2xl font-bold mb-2">Request Submitted!</h2>
          <p className="text-gray-600">
            {detailer?.company_name || 'We'} will contact you shortly with a quote.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          {detailer?.company_name || 'Request a Quote'}
        </h1>
        <p className="text-gray-500 text-sm">Aircraft Detailing Services</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Contact Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="John Smith"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email *</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="john@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Phone</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="(555) 123-4567"
            />
          </div>
        </div>

        {/* Aircraft Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Aircraft Type *</label>
            <select
              value={formData.aircraft_type}
              onChange={(e) => setFormData({ ...formData, aircraft_type: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
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
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="e.g., Cessna Citation CJ3"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tail Number</label>
            <input
              type="text"
              value={formData.tail_number}
              onChange={(e) => setFormData({ ...formData, tail_number: e.target.value.toUpperCase() })}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="N12345"
            />
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium mb-1">Location (Airport/FBO)</label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="e.g., KJFK - Signature Flight Support"
          />
        </div>

        {/* Services */}
        <div>
          <label className="block text-sm font-medium mb-2">Services Needed</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {serviceOptions.map((service) => (
              <label key={service} className="flex items-center text-sm">
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
                  className="mr-2"
                />
                {service}
              </label>
            ))}
          </div>
        </div>

        {/* Custom questions */}
        {questions.map((q) => (
          <div key={q.id}>
            <label className="block text-sm font-medium mb-1">
              {q.question_text} {q.required && '*'}
            </label>
            <input
              type="text"
              value={formData.answers[q.question_key] || ''}
              onChange={(e) => setFormData({
                ...formData,
                answers: { ...formData.answers, [q.question_key]: e.target.value }
              })}
              placeholder={q.placeholder}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        ))}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-1">Additional Notes</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm"
            rows={3}
            placeholder="Any special requests..."
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !formData.name || !formData.email || !formData.aircraft_type}
          className="w-full py-3 bg-v-gold text-white font-semibold rounded hover:bg-v-gold-dim disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Request Quote'}
        </button>
      </div>

      {/* Powered by */}
      <div className="text-center mt-4 text-xs text-gray-400">
        Powered by <a href="https://vectorav.ai" target="_blank" className="text-gray-500 hover:underline">Vector</a>
      </div>
    </div>
  );
}
