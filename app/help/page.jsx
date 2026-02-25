"use client";
import { useState } from 'react';
import { restartTour } from '@/components/DashboardTour';

const FAQ_ITEMS = [
  {
    category: 'Getting Started',
    questions: [
      { q: 'How do I create my first quote?', a: 'From the dashboard, click "New Quote". Select a manufacturer and aircraft model, choose your services or a package, then click "Send Quote" to deliver it via email, SMS, or shareable link.' },
      { q: 'How do I set up my services and rates?', a: 'Go to Settings > Services to add your service menu. Each service links to an aircraft hour column (e.g., Exterior Wash uses ext_wash_hours). Set your hourly rate, and Vector calculates pricing automatically based on aircraft size.' },
      { q: 'How do I connect Stripe for payments?', a: 'Go to Settings and click "Connect Stripe" in the Payments section. You\'ll be redirected to Stripe to create or link your account. Once connected, customers can pay directly from your quotes.' },
      { q: 'What are the different subscription plans?', a: 'Free: 3 quotes/month, 5% fee. Pro ($79/mo): Unlimited quotes, 2% fee, SMS alerts. Business ($149/mo): SMS to clients, team management, 1% fee. Enterprise: Custom pricing, 0% fee.' },
    ],
  },
  {
    category: 'Quoting',
    questions: [
      { q: 'How does aircraft-based pricing work?', a: 'Each aircraft in the database has pre-loaded hours for different services (wash, detail, ceramic, etc.). Vector multiplies those hours by your hourly rate to calculate the price. You can override hours on any individual quote.' },
      { q: 'Can I create custom services?', a: 'Yes. Go to Settings > Services and click "Add Service". Choose which aircraft hour column it uses, set your hourly rate, and optionally add product costs.' },
      { q: 'How do packages work?', a: 'Packages bundle multiple services together with an optional discount. Create them in Settings > Services by dragging services into a package. Customers see one bundled price.' },
      { q: 'Can I add fees to a quote?', a: 'Yes. Add-on fees (hazmat, after hours, rush, travel) can be added to any quote. Set them up in Settings > Services under the "Add-on Fees" section.' },
      { q: 'How do change orders work?', a: 'After a quote is sent, you can create a change order to add services or adjust pricing. The customer receives a new payment link for the additional amount.' },
    ],
  },
  {
    category: 'Payments',
    questions: [
      { q: 'When do I get paid?', a: 'Payments are processed through Stripe and deposited to your connected bank account. Standard Stripe payout timing applies (typically 2 business days).' },
      { q: 'What is the platform fee?', a: 'Vector charges a small fee on each transaction based on your plan: Free (5%), Pro (2%), Business (1%), Enterprise (0%). This is separate from Stripe\'s processing fees.' },
      { q: 'Can I pass the platform fee to the customer?', a: 'Yes. In Settings, enable "Pass fee to customer" and the platform fee will be added to the customer\'s total instead of deducted from your payout.' },
      { q: 'How do refunds work?', a: 'Refunds are handled through your Stripe dashboard at dashboard.stripe.com. Vector does not process refunds directly.' },
    ],
  },
  {
    category: 'Team & Scheduling',
    questions: [
      { q: 'How do I add team members?', a: 'Go to Team > Add Member. Enter their name, role, and pay rate. Team members can be assigned to jobs and their hours tracked through the time log.' },
      { q: 'How does the calendar work?', a: 'The calendar shows all scheduled jobs. When a customer pays a quote, the job appears on the scheduled date. You can also manually schedule jobs from the calendar view.' },
      { q: 'What are recurring services?', a: 'When sending a quote, toggle "Make Recurring" and select an interval (4 weeks, monthly, quarterly). Vector will automatically generate new quotes at each interval.' },
    ],
  },
  {
    category: 'Account & Billing',
    questions: [
      { q: 'How do I upgrade my plan?', a: 'Click the "Upgrade" button in the navigation bar or go to Settings > Subscription. You can upgrade at any time and your new features activate immediately.' },
      { q: 'Can I cancel my subscription?', a: 'Yes. Go to Settings > Subscription and click "Cancel". Your access continues through the end of your billing period.' },
      { q: 'Do you offer annual billing?', a: 'Yes. Annual billing saves 25% compared to monthly. Toggle to "Annual" on the pricing page or in Settings > Subscription.' },
      { q: 'How do promo codes work?', a: 'Enter a promo code during upgrade checkout. Valid codes apply a discount to your subscription. Contact support if you have a code that isn\'t working.' },
    ],
  },
];

const GUIDES = [
  { title: 'Create Your First Quote', description: 'Learn how to build and send a professional quote in under 60 seconds.', icon: '📝', link: '#' },
  { title: 'Set Up Services & Packages', description: 'Configure your service menu, hourly rates, and bundled packages.', icon: '⚙️', link: '/settings/services' },
  { title: 'Connect Stripe Payments', description: 'Link your Stripe account to accept online payments from quotes.', icon: '💳', link: '/settings' },
  { title: 'Add Your Team', description: 'Invite team members, assign jobs, and track hours.', icon: '👥', link: '/team/add' },
  { title: 'Customize Your Quote Page', description: 'Add your logo, colors, and branding to customer-facing quotes.', icon: '🎨', link: '/settings' },
  { title: 'Set Up Recurring Services', description: 'Automate repeat business with recurring quote generation.', icon: '🔄', link: '/recurring' },
];

const SHORTCUTS = [
  { keys: ['N'], description: 'New quote from dashboard' },
  { keys: ['Esc'], description: 'Close modal / cancel' },
  { keys: ['Enter'], description: 'Confirm / submit form' },
  { keys: ['⌘', 'K'], description: 'Search aircraft (in quote builder)' },
  { keys: ['⌘', 'S'], description: 'Save current form' },
  { keys: ['⌘', 'C'], description: 'Copy quote link' },
];

const VIDEOS = [
  { title: 'Getting Started with Vector', duration: '3:42', thumbnail: null },
  { title: 'Building Your First Quote', duration: '2:15', thumbnail: null },
  { title: 'Setting Up Services & Packages', duration: '4:08', thumbnail: null },
  { title: 'Connecting Stripe & Getting Paid', duration: '2:55', thumbnail: null },
  { title: 'Managing Your Team', duration: '3:20', thumbnail: null },
  { title: 'Using the Aircraft Database', duration: '2:48', thumbnail: null },
];

function FAQAccordion({ items }) {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <div className="divide-y divide-white/10">
      {items.map((item, i) => (
        <div key={i}>
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="w-full flex items-center justify-between py-4 text-left group"
          >
            <span className="text-sm font-medium text-white group-hover:text-amber-400 transition-colors pr-4">{item.q}</span>
            <svg
              className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${openIndex === i ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {openIndex === i && (
            <div className="pb-4 pr-8">
              <p className="text-sm text-gray-400 leading-relaxed">{item.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function HelpPage() {
  const [activeTab, setActiveTab] = useState('faq');
  const [contactForm, setContactForm] = useState({ subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [faqCategory, setFaqCategory] = useState(0);

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    if (!contactForm.subject.trim() || !contactForm.message.trim()) return;
    setSending(true);
    try {
      const token = localStorage.getItem('vector_token');
      await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(contactForm),
      });
      setSent(true);
      setContactForm({ subject: '', message: '' });
    } catch {
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  const tabs = [
    { key: 'faq', label: 'FAQ' },
    { key: 'guides', label: 'Getting Started' },
    { key: 'videos', label: 'Videos' },
    { key: 'shortcuts', label: 'Shortcuts' },
    { key: 'contact', label: 'Contact' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="flex items-center gap-4 mb-6 text-white">
          <a href="/dashboard" className="text-2xl hover:text-gray-300">&larr;</a>
          <div>
            <h1 className="text-2xl font-bold">Help & Support</h1>
            <p className="text-gray-400 text-sm">Everything you need to get the most out of Vector</p>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white/5 rounded-lg p-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-amber-500 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* FAQ Tab */}
        {activeTab === 'faq' && (
          <div>
            {/* Category pills */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              {FAQ_ITEMS.map((cat, i) => (
                <button
                  key={i}
                  onClick={() => setFaqCategory(i)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    faqCategory === i
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-white/5 text-gray-400 border border-white/10 hover:text-white'
                  }`}
                >
                  {cat.category}
                </button>
              ))}
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <FAQAccordion items={FAQ_ITEMS[faqCategory].questions} />
            </div>
          </div>
        )}

        {/* Getting Started Tab */}
        {activeTab === 'guides' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-gray-400 text-sm">Follow these guides to set up Vector and start sending professional quotes.</p>
              <button
                onClick={() => { restartTour(); window.location.href = '/dashboard'; }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors whitespace-nowrap ml-4"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Restart Tour
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {GUIDES.map((guide, i) => (
                <a
                  key={i}
                  href={guide.link}
                  className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-amber-500/50 transition-colors group block"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{guide.icon}</span>
                    <div>
                      <h3 className="text-white font-medium text-sm group-hover:text-amber-400 transition-colors">{guide.title}</h3>
                      <p className="text-gray-400 text-xs mt-1 leading-relaxed">{guide.description}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1 text-xs text-amber-500 font-medium">
                    <span>Start guide</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Videos Tab */}
        {activeTab === 'videos' && (
          <div>
            <p className="text-gray-400 text-sm mb-4">Video walkthroughs to help you learn Vector quickly.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {VIDEOS.map((video, i) => (
                <div
                  key={i}
                  className="bg-white/5 border border-white/10 rounded-xl overflow-hidden group"
                >
                  <div className="aspect-video bg-white/[0.03] flex items-center justify-center relative">
                    <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                      <svg className="w-6 h-6 text-white/60 group-hover:text-amber-400 transition-colors ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                    <span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">{video.duration}</span>
                  </div>
                  <div className="p-3">
                    <h3 className="text-white text-sm font-medium">{video.title}</h3>
                    <p className="text-amber-500 text-xs mt-1">Coming soon</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shortcuts Tab */}
        {activeTab === 'shortcuts' && (
          <div>
            <p className="text-gray-400 text-sm mb-4">Keyboard shortcuts to speed up your workflow.</p>
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shortcut</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {SHORTCUTS.map((sc, i) => (
                    <tr key={i} className="hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {sc.keys.map((key, j) => (
                            <span key={j}>
                              <kbd className="px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-white font-mono">
                                {key}
                              </kbd>
                              {j < sc.keys.length - 1 && <span className="text-gray-500 mx-0.5">+</span>}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300">{sc.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Contact Tab */}
        {activeTab === 'contact' && (
          <div className="max-w-lg">
            {sent ? (
              <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-white font-semibold text-lg mb-2">Message sent!</h3>
                <p className="text-gray-400 text-sm mb-4">We&apos;ll get back to you within 24 hours.</p>
                <button
                  onClick={() => setSent(false)}
                  className="text-amber-500 text-sm font-medium hover:text-amber-400"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
                <div>
                  <h3 className="text-white font-semibold mb-1">Contact Support</h3>
                  <p className="text-gray-400 text-xs">Have a question or issue? We&apos;re here to help.</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Subject</label>
                  <input
                    type="text"
                    value={contactForm.subject}
                    onChange={(e) => setContactForm(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="What do you need help with?"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-amber-500/50"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Message</label>
                  <textarea
                    value={contactForm.message}
                    onChange={(e) => setContactForm(prev => ({ ...prev, message: e.target.value }))}
                    placeholder="Describe your question or issue..."
                    rows={5}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-amber-500/50 resize-none"
                    required
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    Or email us at{' '}
                    <a href="mailto:support@vectorav.ai" className="text-amber-500 hover:underline">support@vectorav.ai</a>
                  </p>
                  <button
                    type="submit"
                    disabled={sending}
                    className="px-5 py-2.5 bg-amber-500 text-white rounded-lg font-medium text-sm hover:bg-amber-600 disabled:opacity-50 transition-colors"
                  >
                    {sending ? 'Sending...' : 'Send Message'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-white/10 text-center">
          <p className="text-gray-500 text-xs">
            Need immediate help? Email{' '}
            <a href="mailto:support@vectorav.ai" className="text-amber-500 hover:underline">support@vectorav.ai</a>
          </p>
        </div>
      </div>
    </div>
  );
}
