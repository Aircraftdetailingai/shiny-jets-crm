"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function DeliveryReportPage() {
  const params = useParams();
  const [job, setJob] = useState(null);
  const [photos, setPhotos] = useState({ before: [], after: [] });
  const [detailer, setDetailer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchDelivery = async () => {
      try {
        const res = await fetch(`/api/delivery/${params.shareLink}`);
        if (!res.ok) throw new Error('Delivery report not found');
        const data = await res.json();
        setJob(data.job);
        setPhotos(data.photos || { before: [], after: [] });
        setDetailer(data.detailer);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    if (params.shareLink) fetchDelivery();
  }, [params.shareLink]);

  // Apply detailer theme
  useEffect(() => {
    if (!detailer) return;
    const s = document.documentElement.style;
    s.setProperty('--brand-primary', detailer.theme_primary || '#C9A84C');
    return () => {
      s.removeProperty('--brand-primary');
    };
  }, [detailer]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const getServicesList = (services) => {
    if (!services) return [];
    if (Array.isArray(services)) return services;
    if (typeof services === 'object') {
      const labels = {
        exterior: 'Exterior Wash & Detail',
        interior: 'Interior Detail',
        brightwork: 'Brightwork Polish',
        ceramic: 'Ceramic Coating',
        engine: 'Engine Detail',
        paint_correction: 'Paint Correction',
        leather: 'Leather Conditioning',
        carpet: 'Carpet Shampoo',
        windows: 'Window Treatment',
        wheel_well: 'Wheel Well Detail',
      };
      return Object.entries(services)
        .filter(([, v]) => v === true || v)
        .map(([key]) => labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
    }
    return [];
  };

  // --- LOADING ---
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A0E17' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: '2px solid var(--brand-primary, #C9A84C)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#8A9BB0', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase' }}>Loading</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // --- ERROR ---
  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A0E17', padding: 16 }}>
        <div style={{ background: '#111827', maxWidth: 640, width: '100%', borderRadius: 4, padding: '40px 32px', textAlign: 'center', border: '1px solid #1A2236' }}>
          <div style={{ width: 48, height: 1, background: 'var(--brand-primary, #C9A84C)', margin: '0 auto 32px' }} />
          <p style={{ color: '#8A9BB0', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>Error</p>
          <h1 style={{ color: '#F5F5F5', fontSize: 24, fontWeight: 300, margin: '0 0 12px', fontFamily: '"Playfair Display", serif' }}>Report Not Found</h1>
          <p style={{ color: '#8A9BB0', fontSize: 14 }}>This delivery report link may be invalid or has been removed.</p>
        </div>
      </div>
    );
  }

  const servicesList = getServicesList(job.services);
  const maxPhotos = Math.max(photos.before.length, photos.after.length);
  const completionDate = job.completed_at || job.scheduled_date;

  return (
    <div style={{ minHeight: '100vh', background: '#0A0E17', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <header style={{ padding: '40px 20px 0', textAlign: 'center' }}>
        {detailer?.logo_url && (
          <img
            src={detailer.logo_url}
            alt={detailer.company || ''}
            style={{ maxHeight: 64, maxWidth: 220, margin: '0 auto 12px', display: 'block' }}
          />
        )}
        {detailer?.company && !detailer?.logo_url && (
          <h2 style={{ color: '#F5F5F5', fontSize: 20, fontWeight: 600, margin: '0 0 12px', letterSpacing: '0.05em' }}>
            {detailer.company}
          </h2>
        )}
      </header>

      {/* Content */}
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 60px' }}>
        {/* Badge + Title */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ width: 48, height: 1, background: 'var(--brand-primary, #C9A84C)', margin: '0 auto 24px' }} />
          <span style={{
            display: 'inline-block',
            padding: '6px 20px',
            background: 'rgba(201,168,76,0.1)',
            border: '1px solid rgba(201,168,76,0.3)',
            borderRadius: 2,
            color: 'var(--brand-primary, #C9A84C)',
            fontSize: 11,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            fontWeight: 600,
            marginBottom: 24,
          }}>Delivery Report</span>

          <h1 style={{ color: '#F5F5F5', fontSize: 28, fontWeight: 300, margin: '0 0 8px', fontFamily: '"Playfair Display", Georgia, serif' }}>
            {job.aircraft_model || 'Aircraft Detail'}
          </h1>
          {job.tail_number && (
            <p style={{ color: '#8A9BB0', fontSize: 15, margin: '0 0 8px', letterSpacing: '0.05em' }}>
              {job.tail_number}
            </p>
          )}
          {completionDate && (
            <p style={{ color: '#4A5568', fontSize: 13, margin: 0 }}>
              Completed {formatDate(completionDate)}
            </p>
          )}
        </div>

        {/* Before / After Photos */}
        {maxPhotos > 0 && (
          <section style={{ marginBottom: 48 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, marginBottom: 8 }}>
              <div style={{ textAlign: 'center', padding: '12px 0', borderBottom: '1px solid #1A2236' }}>
                <span style={{ color: '#8A9BB0', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }}>Before</span>
              </div>
              <div style={{ textAlign: 'center', padding: '12px 0', borderBottom: '1px solid #1A2236' }}>
                <span style={{ color: 'var(--brand-primary, #C9A84C)', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }}>After</span>
              </div>
            </div>

            {Array.from({ length: maxPhotos }).map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 4 }}>
                <div style={{ background: '#111827', borderRadius: 4, overflow: 'hidden', aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {photos.before[i] ? (
                    <img
                      src={photos.before[i].url}
                      alt={`Before ${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ color: '#2A3A50', fontSize: 12 }}>--</span>
                  )}
                </div>
                <div style={{ background: '#111827', borderRadius: 4, overflow: 'hidden', aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {photos.after[i] ? (
                    <img
                      src={photos.after[i].url}
                      alt={`After ${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ color: '#2A3A50', fontSize: 12 }}>--</span>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Services Completed */}
        {servicesList.length > 0 && (
          <section style={{ background: '#111827', border: '1px solid #1A2236', borderRadius: 4, padding: '32px 28px', marginBottom: 48 }}>
            <div style={{ width: 32, height: 1, background: 'var(--brand-primary, #C9A84C)', marginBottom: 20 }} />
            <h3 style={{ color: '#F5F5F5', fontSize: 14, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 20px' }}>
              Services Completed
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {servicesList.map((svc, i) => (
                <li key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 0',
                  borderBottom: i < servicesList.length - 1 ? '1px solid #1A2236' : 'none',
                  color: '#D1D5DB',
                  fontSize: 14,
                }}>
                  <span style={{ color: 'var(--brand-primary, #C9A84C)', fontSize: 16 }}>&#10003;</span>
                  {typeof svc === 'string' ? svc : svc.name || svc}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Customer Name */}
        {job.customer_name && (
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <p style={{ color: '#4A5568', fontSize: 13, margin: 0 }}>
              Prepared for <span style={{ color: '#8A9BB0' }}>{job.customer_name}</span>
            </p>
          </div>
        )}
      </main>

      {/* Footer — only pro/business surface "Powered by". Free has SJ in
          the header already; enterprise is white-label. */}
      {(detailer?.plan === 'pro' || detailer?.plan === 'business') && (
        <footer style={{ textAlign: 'center', padding: '24px 20px 40px', borderTop: '1px solid #111827' }}>
          <p style={{ color: '#2A3A50', fontSize: 11, letterSpacing: '0.1em', margin: 0 }}>
            Powered by Shiny Jets CRM
          </p>
        </footer>
      )}
    </div>
  );
}
