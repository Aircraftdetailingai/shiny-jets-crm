"use client";
import { useEffect, useRef, useState } from 'react';

// Reusable barcode scanner — works on iOS Safari, Android Chrome, desktop
// Usage: <BarcodeScanner isOpen={open} onClose={...} onDetected={(upc) => ...} />
export default function BarcodeScanner({ isOpen, onClose, onDetected }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const [error, setError] = useState('');
  const [manualUpc, setManualUpc] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    let stream = null;

    async function start() {
      setError('');
      setStarting(true);
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled) return;

        const reader = new BrowserMultiFormatReader();

        // Request rear camera (works on iOS Safari)
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
          });
        } catch (e) {
          // Fallback to any camera
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.setAttribute('autoplay', 'true');
          videoRef.current.setAttribute('muted', 'true');
          await videoRef.current.play().catch(() => {});
        }

        // Start decoding from the video element
        const controls = await reader.decodeFromStream(stream, videoRef.current, (result, err) => {
          if (cancelled) return;
          if (result) {
            const text = result.getText();
            // Cleanup before firing callback
            try { controls?.stop(); } catch {}
            try { stream?.getTracks().forEach(t => t.stop()); } catch {}
            onDetected(text);
          }
        });
        controlsRef.current = controls;
        setStarting(false);
      } catch (e) {
        console.error('[BarcodeScanner] start error:', e);
        if (!cancelled) {
          setError(e?.message || 'Camera unavailable. Try entering the UPC manually.');
          setStarting(false);
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      try { controlsRef.current?.stop(); } catch {}
      try { stream?.getTracks().forEach(t => t.stop()); } catch {}
      controlsRef.current = null;
    };
  }, [isOpen, onDetected]);

  if (!isOpen) return null;

  const submitManual = (e) => {
    e?.preventDefault();
    const trimmed = manualUpc.replace(/\D/g, '');
    if (trimmed.length >= 8) {
      onDetected(trimmed);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0f1623] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 className="text-white font-semibold text-base">Scan Barcode</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none" aria-label="Close">&times;</button>
        </div>

        {/* Camera viewfinder */}
        <div className="relative bg-black aspect-[4/3] overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className="w-full h-full object-cover"
          />

          {/* Viewfinder overlay */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-3/4 h-1/3 border-2 border-white/70 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]">
              <div className="w-full h-px bg-red-500/80 mt-1/2 animate-pulse" style={{ marginTop: '50%' }} />
            </div>
          </div>

          {/* Status overlay */}
          {starting && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <p className="text-white/80 text-sm">Starting camera...</p>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-6">
              <p className="text-red-300 text-xs text-center">{error}</p>
            </div>
          )}
          {!error && !starting && (
            <div className="absolute bottom-3 left-0 right-0 text-center">
              <p className="text-white/90 text-xs font-medium drop-shadow">Tap to scan — point at the barcode</p>
            </div>
          )}
        </div>

        {/* Manual UPC entry */}
        <form onSubmit={submitManual} className="p-5 border-t border-white/10">
          <label className="block text-white/60 text-[10px] uppercase tracking-wider mb-1.5">Or enter UPC manually</label>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={manualUpc}
              onChange={e => setManualUpc(e.target.value)}
              placeholder="012345678901"
              className="flex-1 bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm placeholder-white/40 outline-none focus:border-blue-400"
            />
            <button
              type="submit"
              disabled={manualUpc.replace(/\D/g, '').length < 8}
              className="px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded-lg hover:bg-blue-600 disabled:opacity-40 transition-colors"
            >
              Look up
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
