"use client";
import { useEffect, useRef, useState } from 'react';
import { ZXING_SCAN_FORMATS, nativeFormatsUsable, normalizeScanFormat, isValidManualCode, classifyScan } from '@/lib/scan-code';

// Reusable product scanner: reads regular barcodes (UPC-A/E, EAN-8/13,
// Code 128, Code 39, ITF) AND QR / Data Matrix codes. Uses the native
// BarcodeDetector when the browser has one, zxing otherwise (iOS Safari).
// Works on iOS Safari, Android Chrome, desktop.
// Usage: <BarcodeScanner isOpen={open} onClose={...} onDetected={(code, format) => ...} />
export default function BarcodeScanner({ isOpen, onClose, onDetected }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const decidedRef = useRef(false);
  // Hold the latest onDetected in a ref so the camera effect can depend on
  // [isOpen] alone. The products page passes a fresh onDetected on every
  // render; depending on it would tear down and restart the camera constantly.
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [starting, setStarting] = useState(false);
  const [detected, setDetected] = useState('');

  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

  // Single-entry point for "we got a code" — guards against the continuous
  // decoder firing more than once and against double cleanup.
  const fire = (text, format) => {
    if (decidedRef.current) return;
    decidedRef.current = true;
    try { controlsRef.current?.stop(); } catch {}
    try { videoRef.current?.srcObject?.getTracks?.().forEach(t => t.stop()); } catch {}
    setDetected(String(text || ''));
    onDetectedRef.current?.(text, format);
  };

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    let stream = null;
    decidedRef.current = false;
    setDetected('');
    setError('');

    async function start() {
      setStarting(true);
      try {
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

        // 1) Native BarcodeDetector (Chrome/Android, Edge, macOS Safari) when
        //    it can read QR *and* retail barcodes. Fast and battery friendly.
        let nativeFormats = null;
        try {
          if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
            nativeFormats = nativeFormatsUsable(await window.BarcodeDetector.getSupportedFormats());
          }
        } catch { nativeFormats = null; }
        if (cancelled) return;

        if (nativeFormats) {
          const detector = new window.BarcodeDetector({ formats: nativeFormats });
          let timer = null;
          let stopped = false;
          const tick = async () => {
            if (stopped || cancelled || decidedRef.current) return;
            try {
              const video = videoRef.current;
              if (video && video.readyState >= 2) {
                const codes = await detector.detect(video);
                const hit = codes && codes.find(c => c && c.rawValue);
                if (hit && !stopped && !cancelled) {
                  fire(hit.rawValue, normalizeScanFormat(hit.format));
                  return;
                }
              }
            } catch {}
            timer = setTimeout(tick, 120);
          };
          controlsRef.current = { stop: () => { stopped = true; clearTimeout(timer); } };
          tick();
          setStarting(false);
          return;
        }

        // 2) Fallback: zxing multi-format (iOS Safari, Firefox). Restricted to
        //    the formats products actually carry: QR + Data Matrix and
        //    UPC/EAN/Code 128/Code 39/ITF.
        const [{ BrowserMultiFormatReader }, lib] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ]);
        if (cancelled) return;
        const BarcodeFormat = lib.BarcodeFormat || {};
        const hints = new Map();
        const formats = ZXING_SCAN_FORMATS.map(k => BarcodeFormat[k]).filter(v => v !== undefined);
        if (formats.length && lib.DecodeHintType) hints.set(lib.DecodeHintType.POSSIBLE_FORMATS, formats);
        const reader = new BrowserMultiFormatReader(hints.size ? hints : undefined);

        // Continuous decode. Fires repeatedly until a code is read — `fire`
        // dedupes so only the first hit is acted on.
        const controls = await reader.decodeFromStream(stream, videoRef.current, (result) => {
          if (cancelled || decidedRef.current || !result) return;
          const text = result.getText();
          let format = '';
          try {
            const fmt = result.getBarcodeFormat?.();
            format = Object.keys(BarcodeFormat).find((k) => BarcodeFormat[k] === fmt) || '';
          } catch {}
          fire(text, format);
        });
        if (cancelled) { try { controls.stop(); } catch {} return; }
        controlsRef.current = controls;
        setStarting(false);
      } catch (e) {
        console.error('[BarcodeScanner] start error:', e);
        if (!cancelled) {
          setError(e?.message || 'Camera unavailable. Try entering the code manually.');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const submitManual = (e) => {
    e?.preventDefault();
    if (!isValidManualCode(manualCode)) return;
    fire(classifyScan(manualCode).code, '');
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0f1623] border border-white/10 rounded-2xl shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 className="text-white font-semibold text-base">Scan barcode or QR code</h3>
          <button onClick={onClose} className="w-10 h-10 -mr-2 flex items-center justify-center text-white/60 hover:text-white text-2xl leading-none" aria-label="Close">&times;</button>
        </div>

        {/* Camera viewfinder */}
        <div className="relative bg-black aspect-[4/3] overflow-hidden" style={{ touchAction: 'none' }}>
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className="w-full h-full object-cover cursor-crosshair"
            style={{ touchAction: 'none' }}
            onClick={() => {
              // iOS tap-to-focus via ImageCapture API
              try {
                const track = videoRef.current?.srcObject?.getVideoTracks()?.[0];
                if (track && 'ImageCapture' in window) {
                  const capture = new ImageCapture(track);
                  capture.getPhotoCapabilities?.().catch(() => {});
                }
              } catch {}
            }}
          />

          {/* Viewfinder overlay */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="h-3/5 aspect-square border-2 border-white/70 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]">
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
          {detected && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-900/70">
              <div className="text-green-300 text-4xl mb-2">&#10003;</div>
              <p className="text-white text-sm font-medium">Scanned</p>
              <p className="text-green-200 text-xs mt-1 font-mono break-all px-6 text-center">{detected}</p>
            </div>
          )}
          {!error && !detected && !starting && (
            <div className="absolute bottom-3 left-0 right-0 text-center">
              <p className="text-white/90 text-xs font-medium drop-shadow">Point the box at the product's barcode or QR code</p>
            </div>
          )}
        </div>

        {/* Manual entry */}
        <form onSubmit={submitManual} className="p-5 border-t border-white/10">
          <p className="text-white/50 text-xs mb-3">Scan barcode or QR code. Regular product barcodes (UPC, EAN, Code 128) and QR codes both work.</p>
          <label htmlFor="scanner-manual-code" className="block text-white/60 text-[10px] uppercase tracking-wider mb-1.5">Or type the barcode or QR code</label>
          <div className="flex gap-2">
            <input
              id="scanner-manual-code"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              placeholder="012345678901 or code"
              className="flex-1 min-w-0 bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm placeholder-white/40 outline-none focus:border-blue-400"
            />
            <button
              type="submit"
              disabled={!isValidManualCode(manualCode)}
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
