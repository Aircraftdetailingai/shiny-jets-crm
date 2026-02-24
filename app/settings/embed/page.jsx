"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function EmbedSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [copied, setCopied] = useState(null);
  const [widgetColor, setWidgetColor] = useState('#f59e0b');
  const [widgetPosition, setWidgetPosition] = useState('right');
  const [widgetTitle, setWidgetTitle] = useState('Get a Quote');
  const qrRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    const stored = localStorage.getItem('vector_user');
    if (!token || !stored) {
      router.push('/login');
      return;
    }
    setUser(JSON.parse(stored));
  }, [router]);

  const detailerId = user?.id || 'YOUR_DETAILER_ID';
  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://app.aircraftdetailing.ai';

  // Widget embed code
  const widgetCode = `<!-- Vector Quote Widget -->
<script>
  window.VectorWidget = {
    detailerId: '${detailerId}',
    color: '${widgetColor}',
    position: '${widgetPosition}',
    title: '${widgetTitle}'
  };
</script>
<script src="${appUrl}/widget.js" async></script>`;

  // iFrame embed code
  const iframeCode = `<!-- Vector Quote Form -->
<iframe
  src="${appUrl}/embed/quote/${detailerId}"
  width="100%"
  height="600"
  frameborder="0"
  style="border: 1px solid #e5e7eb; border-radius: 8px;"
></iframe>`;

  // Direct link
  const directLink = `${appUrl}/quote-request/${detailerId}`;

  // QR Code URL (using QR code API)
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(directLink)}`;

  const copyToClipboard = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const downloadQR = () => {
    const link = document.createElement('a');
    link.href = qrCodeUrl;
    link.download = 'vector-quote-qr.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!user) {
    return <LoadingSpinner message="Loading embed settings..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      {/* Header */}
      <header className="flex justify-between items-center mb-6 text-white">
        <div className="flex items-center space-x-4">
          <a href="/settings" className="text-2xl hover:text-amber-400">&larr;</a>
          <h1 className="text-2xl font-bold">Embed & QR Codes</h1>
        </div>
        <a href="/dashboard" className="text-amber-400 hover:underline">Dashboard</a>
      </header>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* QR Code Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">QR Code</h2>
          <p className="text-gray-600 text-sm mb-4">
            Print this QR code on business cards, flyers, or hangar signage. Customers scan to request a quote.
          </p>

          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="bg-white p-4 border rounded-lg">
              <img
                ref={qrRef}
                src={qrCodeUrl}
                alt="Quote Request QR Code"
                className="w-48 h-48"
              />
            </div>

            <div className="flex-1 space-y-3">
              <p className="text-sm text-gray-500">
                Links to: <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{directLink}</span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={downloadQR}
                  className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600"
                >
                  Download PNG
                </button>
                <button
                  onClick={() => copyToClipboard(directLink, 'link')}
                  className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                >
                  {copied === 'link' ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
              <p className="text-xs text-gray-400">
                Tip: Add this QR code to your invoice footer so customers can easily request their next detail.
              </p>
            </div>
          </div>
        </div>

        {/* Chat Widget Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Chat Widget</h2>
          <p className="text-gray-600 text-sm mb-4">
            Add an AI-powered quote widget to your website. It appears as a floating chat bubble.
          </p>

          {/* Widget Customization */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Button Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={widgetColor}
                  onChange={(e) => setWidgetColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={widgetColor}
                  onChange={(e) => setWidgetColor(e.target.value)}
                  className="flex-1 border rounded px-2 py-1 text-sm font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Position</label>
              <select
                value={widgetPosition}
                onChange={(e) => setWidgetPosition(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="right">Bottom Right</option>
                <option value="left">Bottom Left</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Button Text</label>
              <input
                type="text"
                value={widgetTitle}
                onChange={(e) => setWidgetTitle(e.target.value)}
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>

          {/* Preview */}
          <div className="bg-gray-100 rounded-lg p-4 mb-4">
            <p className="text-xs text-gray-500 mb-2">Preview:</p>
            <div className="relative h-24 bg-white rounded border">
              <div
                className={`absolute bottom-2 ${widgetPosition === 'right' ? 'right-2' : 'left-2'} px-4 py-2 rounded-full text-white text-sm font-medium shadow-lg`}
                style={{ backgroundColor: widgetColor }}
              >
                {widgetTitle}
              </div>
            </div>
          </div>

          {/* Code */}
          <div className="relative">
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto">
              {widgetCode}
            </pre>
            <button
              onClick={() => copyToClipboard(widgetCode, 'widget')}
              className="absolute top-2 right-2 px-3 py-1 bg-gray-700 text-white rounded text-xs hover:bg-gray-600"
            >
              {copied === 'widget' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Paste this code before the closing <code>&lt;/body&gt;</code> tag on your website.
          </p>
        </div>

        {/* iFrame Embed Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Embedded Form (iFrame)</h2>
          <p className="text-gray-600 text-sm mb-4">
            Embed a full quote request form directly into a page on your website.
          </p>

          <div className="relative">
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto">
              {iframeCode}
            </pre>
            <button
              onClick={() => copyToClipboard(iframeCode, 'iframe')}
              className="absolute top-2 right-2 px-3 py-1 bg-gray-700 text-white rounded text-xs hover:bg-gray-600"
            >
              {copied === 'iframe' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Direct Link Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Direct Link</h2>
          <p className="text-gray-600 text-sm mb-4">
            Share this link in emails, social media, or anywhere else.
          </p>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={directLink}
              className="flex-1 bg-gray-100 border rounded px-3 py-2 font-mono text-sm"
            />
            <button
              onClick={() => copyToClipboard(directLink, 'direct')}
              className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600"
            >
              {copied === 'direct' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Usage Tips */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">Tips for Getting More Leads</h3>
          <ul className="text-sm text-blue-800 space-y-2">
            <li>&#8226; Add the QR code to your business cards and leave them at FBOs</li>
            <li>&#8226; Put a sign with the QR code in hangars you service</li>
            <li>&#8226; Add the chat widget to your website's homepage and services page</li>
            <li>&#8226; Include the direct link in your email signature</li>
            <li>&#8226; Share the link on your Google Business profile</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
