"use client";
import { useEffect } from 'react';

// Lightbox modal for full-size photo/video viewing
// Props: items (array of media), index (current item index), onClose, onNav (i => void)
export default function MediaLightbox({ items, index, onClose, onNav }) {
  useEffect(() => {
    if (index === null || index === undefined) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < items.length - 1) onNav(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onNav(index - 1);
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [index, items.length, onClose, onNav]);

  if (index === null || index === undefined || !items[index]) return null;
  const item = items[index];
  const isVideo = item.media_type?.includes('video');

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center" onClick={onClose}>
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10 text-white">
        <span className="text-sm">{index + 1} of {items.length}</span>
        <div className="flex items-center gap-3">
          <a
            href={item.url}
            download
            onClick={(e) => e.stopPropagation()}
            className="text-white/70 hover:text-white text-xs px-3 py-1.5 border border-white/20 rounded"
          >
            Download
          </a>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="text-white/70 hover:text-white text-2xl w-8 h-8 flex items-center justify-center"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Prev button */}
      {index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNav(index - 1); }}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-white/70 hover:text-white w-12 h-12 flex items-center justify-center text-3xl bg-black/40 rounded-full z-10"
          aria-label="Previous"
        >
          &lsaquo;
        </button>
      )}

      {/* Next button */}
      {index < items.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNav(index + 1); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-white/70 hover:text-white w-12 h-12 flex items-center justify-center text-3xl bg-black/40 rounded-full z-10"
          aria-label="Next"
        >
          &rsaquo;
        </button>
      )}

      {/* Media */}
      <div className="max-w-[95vw] max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {isVideo ? (
          <video
            src={item.url}
            controls
            autoPlay
            className="max-w-full max-h-[85vh] rounded"
          />
        ) : (
          <img
            src={item.url}
            alt=""
            className="max-w-full max-h-[85vh] object-contain rounded"
          />
        )}
      </div>

      {/* Bottom info */}
      {(item.notes || item.created_at) && (
        <div className="absolute bottom-0 left-0 right-0 p-4 text-center text-white/70 text-sm bg-gradient-to-t from-black/60 to-transparent">
          {item.notes && <p className="mb-1">{item.notes}</p>}
          {item.created_at && <p className="text-xs text-white/50">{new Date(item.created_at).toLocaleString()}</p>}
        </div>
      )}
    </div>
  );
}
