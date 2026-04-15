"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// Helper to get auth token
const getToken = () => localStorage.getItem('vector_token');

const DEFAULT_QUESTIONS = [
  { key: 'aircraft_type', question: 'What type of aircraft do you have?', placeholder: 'e.g., Cessna 172', required: true },
  { key: 'tail_number', question: 'What is your tail number?', placeholder: 'e.g., N12345', required: false },
  { key: 'location', question: 'Where is your aircraft located?', placeholder: 'Airport code or hangar', required: true },
  { key: 'services', question: 'What services are you interested in?', placeholder: 'e.g., Full detail', required: true },
  { key: 'preferred_date', question: 'When would you like the service?', placeholder: 'e.g., Next week', required: false },
  { key: 'special_concerns', question: 'Any damage or special concerns?', placeholder: 'e.g., Bug damage', required: false },
];

export default function LeadIntakeSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [isDefault, setIsDefault] = useState(true);
  const [activeTab, setActiveTab] = useState('questions');
  const [user, setUser] = useState(null);

  // Website analyzer state
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  // FAQ upload state
  const [faqText, setFaqText] = useState('');
  const [uploadingFaq, setUploadingFaq] = useState(false);
  const [extractedFaqs, setExtractedFaqs] = useState([]);
  const [suggestedFromFaq, setSuggestedFromFaq] = useState([]);

  // Widget preview state
  const [showPreview, setShowPreview] = useState(false);

  // Drag state
  const [draggedIndex, setDraggedIndex] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('vector_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {}
    }
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      const token = getToken();
      if (!token) {
        router.push('/login');
        return;
      }
      const res = await fetch('/api/lead-intake/questions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch');
      }
      const data = await res.json();
      setQuestions(data.questions || DEFAULT_QUESTIONS);
      setIsDefault(data.isDefault);
    } catch (err) {
      setQuestions(DEFAULT_QUESTIONS);
    } finally {
      setLoading(false);
    }
  };

  const saveQuestions = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/lead-intake/questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ action: 'save_all', questions }),
      });

      if (res.ok) {
        setIsDefault(false);
        alert('Settings saved');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to save settings');
      }
    } catch (err) {
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = async () => {
    if (!confirm('Reset all questions to defaults?')) return;

    setSaving(true);
    try {
      const res = await fetch('/api/lead-intake/questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ action: 'reset_defaults' }),
      });

      if (res.ok) {
        setQuestions(DEFAULT_QUESTIONS);
        setIsDefault(true);
      }
    } catch (err) {
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const addQuestion = () => {
    setQuestions([...questions, {
      key: `custom_${Date.now()}`,
      question: '',
      placeholder: '',
      required: false,
    }]);
  };

  const updateQuestion = (index, field, value) => {
    setQuestions(prev => prev.map((q, i) =>
      i === index ? { ...q, [field]: value } : q
    ));
  };

  const removeQuestion = (index) => {
    setQuestions(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragStart = (index) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newQuestions = [...questions];
    const draggedItem = newQuestions[draggedIndex];
    newQuestions.splice(draggedIndex, 1);
    newQuestions.splice(index, 0, draggedItem);
    setQuestions(newQuestions);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const analyzeWebsite = async () => {
    if (!websiteUrl) return;

    setAnalyzing(true);
    setSuggestions([]);

    try {
      const res = await fetch('/api/lead-intake/analyze-website', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ url: websiteUrl }),
      });

      const data = await res.json();
      if (data.suggestions) {
        setSuggestions(data.suggestions);
      }
    } catch (err) {
      alert('Something went wrong');
    } finally {
      setAnalyzing(false);
    }
  };

  const addSuggestion = (suggestion) => {
    setQuestions(prev => [...prev, {
      key: suggestion.key,
      question: suggestion.question,
      placeholder: '',
      required: false,
    }]);
    setSuggestions(prev => prev.filter(s => s.key !== suggestion.key));
  };

  const uploadFaq = async () => {
    if (!faqText.trim()) return;

    setUploadingFaq(true);
    setExtractedFaqs([]);
    setSuggestedFromFaq([]);

    try {
      const formData = new FormData();
      formData.append('text', faqText);

      const res = await fetch('/api/lead-intake/upload-faq', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (data.faqs) {
        setExtractedFaqs(data.faqs);
      }
      if (data.suggestedQuestions) {
        setSuggestedFromFaq(data.suggestedQuestions);
      }
    } catch (err) {
      alert('Something went wrong');
    } finally {
      setUploadingFaq(false);
    }
  };

  const getWidgetCode = () => {
    const userId = user?.id || 'YOUR_DETAILER_ID';
    return `<script src="https://crm.shinyjets.com/widget.js" data-detailer-id="${userId}"></script>`;
  };

  const copyWidgetCode = () => {
    try { navigator.clipboard?.writeText(getWidgetCode()); } catch {}
    alert('Copied to clipboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-v-gold border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="page-transition min-h-screen bg-v-charcoal">
      {/* Header */}
      <div className="bg-v-surface border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/settings')}
                className="text-v-text-secondary hover:text-v-text-secondary"
              >
                &larr; {'Back'}
              </button>
              <h1 className="text-2xl font-bold">AI Lead Intake</h1>
            </div>
            <button
              onClick={saveQuestions}
              disabled={saving}
              className="px-4 py-2 bg-v-gold text-white rounded-lg hover:bg-v-gold-dim disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-4 mt-6">
        <div className="flex border-b bg-v-surface rounded-t-lg">
          {[
            { key: 'questions', label: 'Intake Questions' },
            { key: 'website', label: 'Analyze Website' },
            { key: 'faq', label: 'Upload FAQ' },
            { key: 'widget', label: 'Get Widget Code' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-6 py-3 font-medium border-b-2 -mb-px ${
                activeTab === tab.key
                  ? 'border-v-gold text-v-gold'
                  : 'border-transparent text-v-text-secondary hover:text-v-text-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {activeTab === 'questions' && (
          <div className="bg-v-surface rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-semibold">Customize Your Intake Questions</h2>
                <p className="text-sm text-v-text-secondary">
                  These questions will be asked in the quote request widget on your website
                </p>
              </div>
              <button
                onClick={resetToDefaults}
                className="text-sm text-v-text-secondary hover:text-v-text-secondary"
              >
                Reset to Defaults
              </button>
            </div>

            <div className="space-y-4">
              {questions.map((q, index) => (
                <div
                  key={q.key || index}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`border rounded-lg p-4 ${
                    draggedIndex === index ? 'opacity-50 bg-v-gold/10' : 'bg-v-surface'
                  } cursor-move`}
                >
                  <div className="flex gap-4">
                    {/* Drag Handle */}
                    <div className="text-v-text-secondary pt-2">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z"/>
                      </svg>
                    </div>

                    <div className="flex-1 space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-v-text-secondary mb-1">
                          Question
                        </label>
                        <input
                          type="text"
                          value={q.question}
                          onChange={(e) => updateQuestion(index, 'question', e.target.value)}
                          className="w-full border rounded-lg px-3 py-2"
                          placeholder="What would you like to ask?"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-v-text-secondary mb-1">
                            Placeholder
                          </label>
                          <input
                            type="text"
                            value={q.placeholder || ''}
                            onChange={(e) => updateQuestion(index, 'placeholder', e.target.value)}
                            className="w-full border rounded-lg px-3 py-2"
                            placeholder="e.g., Example answer"
                          />
                        </div>
                        <div className="flex items-end gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={q.required}
                              onChange={(e) => updateQuestion(index, 'required', e.target.checked)}
                              className="w-4 h-4 text-v-gold"
                            />
                            <span className="text-sm">{'Required'}</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Delete Button */}
                    <button
                      onClick={() => removeQuestion(index)}
                      className="text-red-500 hover:text-red-700 pt-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addQuestion}
              className="mt-4 w-full py-3 border-2 border-dashed border-v-border rounded-lg text-v-text-secondary hover:border-v-gold hover:text-v-gold"
            >
              + Add Question
            </button>
          </div>
        )}

        {activeTab === 'website' && (
          <div className="bg-v-surface rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-2">AI Website Analyzer</h2>
            <p className="text-sm text-v-text-secondary mb-6">
              Enter your website URL and we'll suggest relevant intake questions based on your services
            </p>

            <div className="flex gap-4">
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                className="flex-1 border rounded-lg px-4 py-2"
                placeholder="https://yourcompany.com"
              />
              <button
                onClick={analyzeWebsite}
                disabled={analyzing || !websiteUrl}
                className="px-6 py-2 bg-v-gold text-white rounded-lg hover:bg-v-gold-dim disabled:opacity-50"
              >
                {analyzing ? 'Processing...' : 'Analyze'}
              </button>
            </div>

            {suggestions.length > 0 && (
              <div className="mt-6">
                <h3 className="font-medium mb-4">Suggested Questions</h3>
                <div className="space-y-3">
                  {suggestions.map((s, i) => (
                    <div key={i} className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium">{s.question}</p>
                        <p className="text-sm text-blue-600">{s.reason}</p>
                      </div>
                      <button
                        onClick={() => addSuggestion(s)}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm"
                      >
                        {'Add'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'faq' && (
          <div className="bg-v-surface rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-2">Upload FAQ</h2>
            <p className="text-sm text-v-text-secondary mb-6">
              Paste your FAQ content and we'll extract Q&A pairs for your quote widget
            </p>

            <textarea
              value={faqText}
              onChange={(e) => setFaqText(e.target.value)}
              className="w-full border rounded-lg px-4 py-3 h-48"
              placeholder="Paste your FAQ content here...

Example:
Q: How long does a detail take?
A: Typically 4-8 hours depending on aircraft size.

Q: Do you offer mobile service?
A: Yes, we come to your hangar."
            />

            <button
              onClick={uploadFaq}
              disabled={uploadingFaq || !faqText.trim()}
              className="mt-4 px-6 py-2 bg-v-gold text-white rounded-lg hover:bg-v-gold-dim disabled:opacity-50"
            >
              {uploadingFaq ? 'Processing...' : 'Extract FAQs'}
            </button>

            {extractedFaqs.length > 0 && (
              <div className="mt-6">
                <h3 className="font-medium mb-4">Extracted FAQs ({extractedFaqs.length})</h3>
                <div className="space-y-3">
                  {extractedFaqs.map((faq, i) => (
                    <div key={i} className="p-4 bg-green-50 rounded-lg">
                      <p className="font-medium">{faq.question}</p>
                      <p className="text-sm text-v-text-secondary mt-1">{faq.answer}</p>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-green-600 mt-4">
                  These FAQs have been saved and are available in your quote widget.
                </p>
              </div>
            )}

            {suggestedFromFaq.length > 0 && (
              <div className="mt-6">
                <h3 className="font-medium mb-4">Suggested Intake Questions</h3>
                <div className="space-y-3">
                  {suggestedFromFaq.map((s, i) => (
                    <div key={i} className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg">
                      <p className="flex-1 font-medium">{s.question}</p>
                      <button
                        onClick={() => {
                          setQuestions(prev => [...prev, { ...s, placeholder: '', required: false }]);
                          setSuggestedFromFaq(prev => prev.filter((_, idx) => idx !== i));
                        }}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm"
                      >
                        {'Add'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'widget' && (
          <div className="bg-v-surface rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-2">Embed Quote Widget</h2>
            <p className="text-sm text-v-text-secondary mb-6">
              Add this code to your website to display the quote request widget
            </p>

            <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-green-400 overflow-x-auto">
              {getWidgetCode()}
            </div>

            <button
              onClick={copyWidgetCode}
              className="mt-4 px-6 py-2 bg-v-gold text-white rounded-lg hover:bg-v-gold-dim"
            >
              Copy Code
            </button>

            <div className="mt-8 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-medium text-blue-900 mb-2">Customization Options</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li><code className="bg-blue-100 px-1">data-position</code> - "bottom-right" (default), "bottom-left", "top-right", "top-left"</li>
                <li><code className="bg-blue-100 px-1">data-color</code> - Primary color (default: your brand color)</li>
              </ul>
              <p className="text-sm text-blue-700 mt-3">
                Example: <code className="bg-blue-100 px-1">&lt;script src="..." data-position="bottom-left" data-color="#3b82f6"&gt;&lt;/script&gt;</code>
              </p>
            </div>

            <div className="mt-8">
              <h3 className="font-medium mb-4">Preview Widget</h3>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="px-4 py-2 border rounded-lg hover:bg-white/5"
              >
                {showPreview ? 'Hide Preview' : 'Show Preview'}
              </button>

              {showPreview && (
                <div className="mt-4 border rounded-lg p-4 bg-v-charcoal h-96 relative">
                  <p className="text-center text-v-text-secondary text-sm">
                    Widget preview would appear on your actual website.
                    <br />
                    Deploy the code to see it in action!
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
