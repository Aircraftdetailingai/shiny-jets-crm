"use client";

// Unified grid showing photos and videos as thumbnails
// Props: items (array), selectedIds (Set), onSelect(id), onOpen(index)
export default function MediaGrid({ items, selectedIds, onSelect, onOpen }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
      {items.map((item, i) => {
        const isVideo = item.media_type?.includes('video');
        const isSelected = selectedIds?.has(item.id);
        return (
          <div key={item.id} className={`relative group aspect-square rounded-lg overflow-hidden bg-black/20 cursor-pointer ${isSelected ? 'ring-2 ring-v-gold' : ''}`}>
            <button
              type="button"
              onClick={() => onOpen(i)}
              className="absolute inset-0 w-full h-full"
              aria-label="View full size"
            >
              {isVideo ? (
                <>
                  <video
                    src={item.url}
                    className="w-full h-full object-cover"
                    preload="metadata"
                    muted
                    playsInline
                  />
                  {/* Play button overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors pointer-events-none">
                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                      <svg className="w-5 h-5 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                  {/* Video badge */}
                  <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-medium pointer-events-none">
                    VIDEO
                  </span>
                </>
              ) : (
                <img
                  src={item.url}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              )}
            </button>

            {/* Selection checkbox */}
            {onSelect && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelect(item.id); }}
                className={`absolute top-1.5 left-1.5 w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
                  isSelected
                    ? 'bg-v-gold border-v-gold'
                    : 'bg-black/40 border-white/60 opacity-0 group-hover:opacity-100'
                }`}
                aria-label={isSelected ? 'Deselect' : 'Select'}
              >
                {isSelected && (
                  <svg className="w-4 h-4 text-v-charcoal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
