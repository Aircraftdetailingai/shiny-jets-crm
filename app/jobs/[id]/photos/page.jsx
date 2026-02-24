"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function JobPhotosPage() {
  const router = useRouter();
  const params = useParams();
  const quoteId = params.id;

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState(null);
  const [beforeMedia, setBeforeMedia] = useState([]);
  const [afterMedia, setAfterMedia] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchData(token);
  }, [router, quoteId]);

  const fetchData = async (token) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch quote details
      const quoteRes = await fetch(`/api/quotes/${quoteId}`, { headers });
      if (quoteRes.ok) {
        const data = await quoteRes.json();
        setQuote(data);
      }

      // Fetch existing media
      const mediaRes = await fetch(`/api/job-media?quote_id=${quoteId}`, { headers });
      if (mediaRes.ok) {
        const data = await mediaRes.json();
        setBeforeMedia(data.beforeMedia || []);
        setAfterMedia(data.afterMedia || []);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError('Failed to load job data');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadClick = (type) => {
    setUploadType(type);
    setNotes('');
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !uploadType) return;

    setUploading(true);
    setError(null);

    try {
      const token = localStorage.getItem('vector_token');

      // For now, create a data URL (in production, upload to Supabase Storage)
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result;

        // In production, you'd upload to storage and get a URL back
        // For demo, we'll use the data URL directly (not ideal for large files)
        const res = await fetch('/api/job-media', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            quote_id: quoteId,
            media_type: uploadType,
            url: dataUrl,
            notes: notes || null,
          }),
        });

        if (res.ok) {
          // Refresh media list
          await fetchData(token);
          setUploadType(null);
          setNotes('');
        } else {
          const data = await res.json();
          setError(data.error || 'Upload failed');
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Upload error:', err);
      setError('Failed to upload file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (mediaId) => {
    if (!confirm('Delete this media?')) return;

    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch(`/api/job-media?id=${mediaId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        await fetchData(token);
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading photos..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*,video/*"
        className="hidden"
        capture="environment"
      />

      {/* Header */}
      <header className="text-white flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <a href="/calendar" className="text-2xl hover:text-amber-400">&#8592;</a>
          <div>
            <h1 className="text-2xl font-bold">Job Documentation</h1>
            {quote && (
              <p className="text-gray-400 text-sm">
                {quote.aircraft_type} {quote.aircraft_model}
              </p>
            )}
          </div>
        </div>
        <a href={`/quotes/${quoteId}`} className="text-sm text-amber-400 hover:underline">
          View Quote
        </a>
      </header>

      {error && (
        <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button onClick={() => setError(null)} className="float-right">&times;</button>
        </div>
      )}

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Before Section */}
        <div className="bg-white rounded-xl p-6 shadow">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span className="text-2xl">&#128249;</span> Before Photos/Video
              </h2>
              <p className="text-sm text-gray-500">Document the aircraft condition before starting</p>
            </div>
            {beforeMedia.length > 0 && (
              <span className="text-green-600 text-sm font-medium">
                &#10003; {beforeMedia.length} uploaded
              </span>
            )}
          </div>

          {/* Before media gallery */}
          {beforeMedia.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {beforeMedia.map((item) => (
                <div key={item.id} className="relative group">
                  {item.media_type.includes('video') ? (
                    <video
                      src={item.url}
                      controls
                      className="w-full h-32 object-cover rounded-lg"
                    />
                  ) : (
                    <img
                      src={item.url}
                      alt="Before"
                      className="w-full h-32 object-cover rounded-lg"
                    />
                  )}
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="absolute top-1 right-1 bg-red-500 text-white w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-sm"
                  >
                    &times;
                  </button>
                  {item.notes && (
                    <p className="text-xs text-gray-500 mt-1 truncate">{item.notes}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    {new Date(item.created_at).toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Upload buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => handleUploadClick('before_video')}
              disabled={uploading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              <span>&#127909;</span>
              {uploading && uploadType === 'before_video' ? 'Uploading...' : 'Record Video'}
            </button>
            <button
              onClick={() => handleUploadClick('before_photo')}
              disabled={uploading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              <span>&#128247;</span>
              {uploading && uploadType === 'before_photo' ? 'Uploading...' : 'Take Photo'}
            </button>
          </div>
        </div>

        {/* After Section */}
        <div className="bg-white rounded-xl p-6 shadow">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span className="text-2xl">&#128248;</span> After Photos
              </h2>
              <p className="text-sm text-gray-500">Document your completed work</p>
            </div>
            {afterMedia.length > 0 && (
              <span className="text-green-600 text-sm font-medium">
                &#10003; {afterMedia.length} uploaded
              </span>
            )}
          </div>

          {/* After media gallery */}
          {afterMedia.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {afterMedia.map((item) => (
                <div key={item.id} className="relative group">
                  {item.media_type.includes('video') ? (
                    <video
                      src={item.url}
                      controls
                      className="w-full h-32 object-cover rounded-lg"
                    />
                  ) : (
                    <img
                      src={item.url}
                      alt="After"
                      className="w-full h-32 object-cover rounded-lg"
                    />
                  )}
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="absolute top-1 right-1 bg-red-500 text-white w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-sm"
                  >
                    &times;
                  </button>
                  {item.notes && (
                    <p className="text-xs text-gray-500 mt-1 truncate">{item.notes}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    {new Date(item.created_at).toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Upload buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => handleUploadClick('after_photo')}
              disabled={uploading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
            >
              <span>&#128247;</span>
              {uploading && uploadType === 'after_photo' ? 'Uploading...' : 'Take Photo'}
            </button>
            <button
              onClick={() => handleUploadClick('after_video')}
              disabled={uploading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
            >
              <span>&#127909;</span>
              {uploading && uploadType === 'after_video' ? 'Uploading...' : 'Record Video'}
            </button>
          </div>
        </div>

        {/* Tips Card */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="font-bold text-amber-900 mb-2">&#128161; Documentation Tips</h3>
          <ul className="text-sm text-amber-800 space-y-1">
            <li>&#8226; Capture any existing damage or stains before starting</li>
            <li>&#8226; Take wide shots and close-ups of problem areas</li>
            <li>&#8226; Video walk-around shows more than photos</li>
            <li>&#8226; After photos are great for social media</li>
            <li>&#8226; Customers love seeing before/after comparisons</li>
          </ul>
        </div>

        {/* Completion Summary */}
        <div className="bg-white rounded-xl p-6 shadow">
          <h3 className="font-bold text-gray-900 mb-3">Documentation Status</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Before Documentation</span>
              {beforeMedia.length > 0 ? (
                <span className="text-green-600 font-medium">&#10003; Complete</span>
              ) : (
                <span className="text-amber-600 font-medium">&#9888; Missing</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">After Documentation</span>
              {afterMedia.length > 0 ? (
                <span className="text-green-600 font-medium">&#10003; Complete</span>
              ) : (
                <span className="text-amber-600 font-medium">&#9888; Missing</span>
              )}
            </div>
          </div>

          {beforeMedia.length > 0 && afterMedia.length > 0 && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 font-medium">
                &#127881; Great job! Full documentation complete.
              </p>
              <p className="text-green-600 text-sm">
                Your customer can view these in their portal.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
