"use client";
import { useState } from 'react';
import { useParams } from 'next/navigation';

export default function UploadPhotosPage() {
  const { token } = useParams();
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleUpload = async () => {
    if (photos.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('lead_id', token);
      formData.append('photo_count', String(photos.length));
      photos.forEach((p, i) => {
        formData.append(`photo_${i}`, p.file);
        formData.append(`caption_${i}`, p.caption || '');
      });

      const res = await fetch('/api/lead-intake/upload-photos', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');

      // Notify that photos were added
      await fetch('/api/lead-intake/photos-received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: token }),
      }).catch(() => {});

      setDone(true);
    } catch (err) {
      setError(err.message);
    }
    setUploading(false);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-[#0D1B2A] flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
        </div>
        <h2 className="text-2xl font-light text-white mb-3">Photos Uploaded!</h2>
        <p className="text-white/60 text-sm">Your detailer has been notified and will finalize your quote shortly.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-6 py-8">
      <div className="max-w-lg mx-auto">
        <h1 className="text-xl font-light text-white mb-2">Upload Photos</h1>
        <p className="text-white/40 text-xs mb-6">Your detailer needs photos to complete your quote. Up to 20 photos.</p>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {photos.map((p, i) => (
              <div key={i} className="relative">
                <img src={p.preview} alt="" className="w-full h-24 object-cover rounded-lg border border-white/10" />
                <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">x</button>
                <input type="text" value={p.caption} placeholder="Caption..."
                  onChange={e => setPhotos(prev => prev.map((ph, j) => j === i ? { ...ph, caption: e.target.value } : ph))}
                  className="w-full mt-1 bg-white/5 border border-white/10 text-white text-[10px] px-2 py-1 rounded outline-none placeholder-white/30" />
              </div>
            ))}
          </div>
        )}

        <label className="w-full p-10 rounded-lg border-2 border-dashed border-white/20 text-center cursor-pointer hover:border-[#007CB1]/50 transition-colors block mb-6">
          <input type="file" accept="image/*" multiple className="hidden"
            onChange={e => {
              const files = Array.from(e.target.files || []);
              const newPhotos = files.map(f => ({ file: f, preview: URL.createObjectURL(f), caption: '' }));
              setPhotos(prev => [...prev, ...newPhotos].slice(0, 20));
              e.target.value = '';
            }} />
          <p className="text-white/60 text-sm">{photos.length > 0 ? 'Add more photos' : 'Tap to take or upload photos'}</p>
          <p className="text-white/30 text-[10px] mt-1">JPG, PNG, HEIC accepted</p>
        </label>

        {photos.length > 0 && (
          <button onClick={handleUpload} disabled={uploading}
            className="w-full py-4 rounded-lg text-sm font-semibold uppercase tracking-wider bg-[#007CB1] text-white hover:bg-[#006a9e] min-h-[48px] disabled:opacity-40">
            {uploading ? 'Uploading...' : `Submit ${photos.length} Photo${photos.length !== 1 ? 's' : ''}`}
          </button>
        )}

        <p className="text-white/20 text-[10px] leading-relaxed mt-6 text-center">
          Photos are used for documentation and quote accuracy only. Never shared publicly.
        </p>
      </div>
    </div>
  );
}
