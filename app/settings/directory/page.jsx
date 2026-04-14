"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DirectorySettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const [listed, setListed] = useState(false);
  const [onlineBooking, setOnlineBooking] = useState(false);
  const [homeAirport, setHomeAirport] = useState('');
  const [airports, setAirports] = useState([]);
  const [newAirport, setNewAirport] = useState('');
  const [description, setDescription] = useState('');
  const [certifications, setCertifications] = useState([]);
  const [newCert, setNewCert] = useState('');
  const [verifiedFinish, setVerifiedFinish] = useState(false);
  const [verifiedFinishStatus, setVerifiedFinishStatus] = useState('none');
  const [verifiedFinishExpiresAt, setVerifiedFinishExpiresAt] = useState(null);
  const [userPlan, setUserPlan] = useState('free');
  const [vfApplying, setVfApplying] = useState(false);
  const [vfChecklist, setVfChecklist] = useState({ equipment: false, chemicals: false, training: false, insurance: false, experience: false, standards: false });
  const [vfDescription, setVfDescription] = useState('');
  const [vfPortfolioUrls, setVfPortfolioUrls] = useState('');
  const [services, setServices] = useState([]);

  // Insurance
  const [insuranceUrl, setInsuranceUrl] = useState(null);
  const [insuranceExpiry, setInsuranceExpiry] = useState(null);
  const [insuranceVerified, setInsuranceVerified] = useState(false);
  const [insuranceInsurer, setInsuranceInsurer] = useState('');
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : null;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    Promise.all([
      fetch('/api/user/me', { headers }).then(r => r.ok ? r.json() : null),
      fetch('/api/services', { headers }).then(r => r.ok ? r.json() : { services: [] }),
    ]).then(([userData, svcData]) => {
      if (userData?.user) {
        const u = userData.user;
        setListed(u.listed_in_directory || false);
        setOnlineBooking(u.has_online_booking || false);
        setHomeAirport(u.home_airport || '');
        setAirports(u.airports_served || []);
        setDescription(u.directory_description || '');
        setCertifications((u.certifications || []).filter(c => c !== 'Verified Finish Certified'));
        setVerifiedFinish(u.verified_finish || false);
        setVerifiedFinishStatus(u.verified_finish_status || 'none');
        setVerifiedFinishExpiresAt(u.verified_finish_expires_at || null);
        setUserPlan(u.plan || 'free');
        setInsuranceUrl(u.insurance_url || null);
        setInsuranceExpiry(u.insurance_expiry_date || null);
        setInsuranceVerified(u.insurance_verified || false);
        setInsuranceInsurer(u.insurance_insurer || '');
      }
      setServices((svcData.services || svcData || []).map(s => s.name));
    }).finally(() => setLoading(false));
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/directory/settings', {
        method: 'POST', headers,
        body: JSON.stringify({
          listed_in_directory: listed,
          has_online_booking: onlineBooking,
          home_airport: homeAirport.trim().toUpperCase() || null,
          airports_served: airports,
          directory_description: description.slice(0, 200),
          certifications,
          insurance_insurer: insuranceInsurer,
          insurance_expiry_date: insuranceExpiry,
        }),
      });
      if (res.ok) showToast('Directory settings saved');
      else showToast('Failed to save');
    } catch { showToast('Failed to save'); }
    finally { setSaving(false); }
  };

  const handleInsuranceUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/directory/insurance/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        setInsuranceUrl(data.url);
        showToast('Insurance uploaded — verifying...');
        // Auto-verify
        setVerifying(true);
        const vRes = await fetch('/api/directory/insurance/verify', {
          method: 'POST', headers,
          body: JSON.stringify({ url: data.url }),
        });
        const vData = await vRes.json();
        if (vData.success) {
          setInsuranceExpiry(vData.expiry_date);
          setInsuranceVerified(true);
          setInsuranceInsurer(vData.insurer || '');
          showToast('Insurance verified!');
        } else {
          showToast(vData.error || 'Could not auto-verify — please check manually');
        }
        setVerifying(false);
      }
    } catch { showToast('Upload failed'); }
    finally { setUploading(false); }
  };

  const cls = 'w-full bg-v-surface border border-v-border text-v-text-primary rounded-sm px-3 py-2 text-sm outline-none focus:border-v-gold/50';

  if (loading) return <div className="p-8 text-v-text-secondary">Loading...</div>;

  return (
    <div className="max-w-3xl space-y-8">
      {toast && <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg z-50 text-sm">{toast}</div>}

      <h2 className="text-xs font-medium uppercase tracking-widest text-v-gold pb-2 border-b border-v-gold/20">Directory Listing</h2>

      {/* Listing Toggle */}
      <div className="flex items-center justify-between p-4 bg-v-surface border border-v-border rounded">
        <div>
          <p className="text-sm text-v-text-primary font-medium">List in Shiny Jets Directory</p>
          <p className="text-xs text-v-text-secondary mt-0.5">Appear in the public detailer directory</p>
        </div>
        <div onClick={() => setListed(!listed)}
          className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${listed ? 'bg-v-gold' : 'bg-gray-600'}`}>
          <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${listed ? 'translate-x-5' : ''}`} />
        </div>
      </div>

      {/* Online Booking */}
      <div className="flex items-center justify-between p-4 bg-v-surface border border-v-border rounded">
        <div>
          <p className="text-sm text-v-text-primary font-medium">Accept online booking requests</p>
          <p className="text-xs text-v-text-secondary mt-0.5">Customers can request quotes from your listing</p>
        </div>
        <div onClick={() => setOnlineBooking(!onlineBooking)}
          className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${onlineBooking ? 'bg-v-gold' : 'bg-gray-600'}`}>
          <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${onlineBooking ? 'translate-x-5' : ''}`} />
        </div>
      </div>

      {/* Home Airport */}
      <div>
        <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Home Airport (ICAO)</label>
        <input
          value={homeAirport}
          onChange={e => setHomeAirport(e.target.value.toUpperCase().slice(0, 4))}
          placeholder="e.g. KCNO"
          maxLength={4}
          className={cls + ' uppercase tracking-wider'}
          style={{ fontFamily: 'monospace' }}
        />
        <p className="text-[10px] text-v-text-secondary mt-1">
          Your primary base — used to place your pin on the directory map at directory.shinyjets.com
        </p>
      </div>

      {/* Airports */}
      <div>
        <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Airports Served</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {airports.map(a => (
            <span key={a} className="px-2 py-1 bg-v-gold/10 text-v-gold text-xs rounded flex items-center gap-1">
              {a}
              <button onClick={() => setAirports(prev => prev.filter(x => x !== a))} className="text-v-gold/60 hover:text-red-400">&times;</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newAirport} onChange={e => setNewAirport(e.target.value.toUpperCase())} placeholder="ICAO code (e.g. KTEB)" className={cls} />
          <button onClick={() => { if (newAirport.trim() && !airports.includes(newAirport.trim())) { setAirports([...airports, newAirport.trim()]); setNewAirport(''); } }}
            className="px-4 py-2 bg-v-gold text-v-charcoal text-xs font-semibold rounded">Add</button>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Business Description</label>
        <textarea value={description} onChange={e => setDescription(e.target.value.slice(0, 200))} rows={3} placeholder="Brief description of your services..." className={cls + ' resize-none'} />
        <p className="text-[10px] text-v-text-secondary mt-1">{description.length}/200</p>
      </div>

      {/* Insurance */}
      <div>
        <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Certificate of Insurance</label>
        <div className="bg-v-surface border border-v-border rounded p-4 space-y-4">
          {insuranceVerified ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-xs font-medium">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                Verified &amp; Insured
              </span>
            </div>
          ) : (
            <p className="text-v-text-secondary text-xs">Upload your COI to show the &ldquo;Insured&rdquo; badge on your listing</p>
          )}

          {insuranceUrl && (
            <a href={insuranceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-v-gold text-xs hover:underline">
              View current COI &rarr;
            </a>
          )}

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-v-text-secondary mb-1">Upload COI (PDF or image)</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => handleInsuranceUpload(e.target.files?.[0])} className="text-xs text-v-text-secondary" />
            {(uploading || verifying) && <p className="text-xs text-v-gold mt-2">{verifying ? 'Verifying with AI...' : 'Uploading...'}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-v-text-secondary mb-1">Insurance Provider</label>
              <input type="text" value={insuranceInsurer} onChange={e => setInsuranceInsurer(e.target.value)} placeholder="e.g. Global Aerospace" className={cls} />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-v-text-secondary mb-1">Expiry Date</label>
              <input type="date" value={insuranceExpiry || ''} onChange={e => setInsuranceExpiry(e.target.value)} className={cls} />
            </div>
          </div>
        </div>
      </div>

      {/* Verified Finish Program */}
      <div>
        <h2 className="text-xs font-medium uppercase tracking-widest text-v-gold pb-2 border-b border-v-gold/20 mb-4">Verified Finish Program</h2>

        {userPlan !== 'enterprise' ? (
          <div className="bg-v-surface border border-v-border rounded p-5 text-center space-y-3">
            <div className="text-2xl">🏅</div>
            <p className="text-sm text-v-text-primary font-medium">Verified Finish Certification</p>
            <p className="text-xs text-v-text-secondary">The Verified Finish badge signals premium quality to aircraft owners. Available on the Enterprise plan.</p>
            <a href="https://shinyjets.com/products/aircraft-detailing-crm-enterprise" target="_blank" rel="noreferrer" className="inline-block px-5 py-2 bg-v-gold text-v-charcoal text-xs font-semibold rounded">Upgrade to Enterprise</a>
          </div>
        ) : verifiedFinishStatus === 'approved' ? (
          <div className="bg-v-surface border border-v-gold/30 rounded p-5 space-y-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-v-gold/15 border border-v-gold/30 rounded text-v-gold text-xs font-semibold">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                Verified Finish Certified
              </span>
            </div>
            <p className="text-sm text-v-text-primary">Your Verified Finish badge is active and displayed on your listing.</p>
            {verifiedFinishExpiresAt && (
              <p className="text-xs text-v-text-secondary">
                Certified until <strong className="text-v-gold">{new Date(verifiedFinishExpiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>
              </p>
            )}
          </div>
        ) : verifiedFinishStatus === 'pending' ? (
          <div className="bg-v-surface border border-amber-500/30 rounded p-5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 text-lg">⏳</span>
              <p className="text-sm text-v-text-primary font-medium">Application Under Review</p>
            </div>
            <p className="text-xs text-v-text-secondary">Your Verified Finish application is being reviewed. You will be notified by email once a decision is made.</p>
          </div>
        ) : verifiedFinishStatus === 'expired' ? (
          <div className="bg-v-surface border border-red-500/30 rounded p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-red-400 text-lg">⚠️</span>
              <p className="text-sm text-v-text-primary font-medium">Certification Expired</p>
            </div>
            <p className="text-xs text-v-text-secondary">Your Verified Finish certification has expired. Reapply below to renew.</p>
            <button onClick={() => setVerifiedFinishStatus('none')} className="px-4 py-2 bg-v-gold text-v-charcoal text-xs font-semibold rounded">Reapply</button>
          </div>
        ) : (
          <div className="bg-v-surface border border-v-border rounded p-5 space-y-4">
            <div>
              <p className="text-sm text-v-text-primary font-medium mb-1">Apply for Verified Finish</p>
              <p className="text-xs text-v-text-secondary">Confirm each requirement to apply for the Verified Finish certification badge.</p>
            </div>

            <div className="space-y-2">
              {[
                { key: 'equipment', label: 'I use professional-grade detailing equipment' },
                { key: 'chemicals', label: 'I use only aviation-approved chemicals and products' },
                { key: 'training', label: 'I have completed formal aviation detailing training' },
                { key: 'insurance', label: 'I maintain adequate liability insurance coverage' },
                { key: 'experience', label: 'I have 2+ years of aviation detailing experience' },
                { key: 'standards', label: 'I agree to uphold Verified Finish quality standards' },
              ].map(item => (
                <label key={item.key} className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={vfChecklist[item.key]}
                    onChange={() => setVfChecklist(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                    className="mt-0.5 accent-[var(--v-gold)]"
                  />
                  <span className="text-xs text-v-text-primary group-hover:text-v-gold transition-colors">{item.label}</span>
                </label>
              ))}
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-v-text-secondary mb-1">Business Description</label>
              <textarea
                value={vfDescription}
                onChange={e => setVfDescription(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="Tell us about your aviation detailing business, experience, and specialties..."
                className={cls + ' resize-none'}
              />
              <p className="text-[10px] text-v-text-secondary mt-1">{vfDescription.length}/500</p>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-v-text-secondary mb-1">Portfolio URLs (one per line)</label>
              <textarea
                value={vfPortfolioUrls}
                onChange={e => setVfPortfolioUrls(e.target.value)}
                rows={2}
                placeholder="https://instagram.com/yourwork&#10;https://yourwebsite.com/gallery"
                className={cls + ' resize-none'}
              />
            </div>

            <button
              onClick={async () => {
                const allChecked = Object.values(vfChecklist).every(v => v);
                if (!allChecked) { showToast('Please confirm all checklist items'); return; }
                setVfApplying(true);
                try {
                  const urls = vfPortfolioUrls.split('\n').map(u => u.trim()).filter(Boolean);
                  const res = await fetch('/api/verified-finish/apply', {
                    method: 'POST', headers,
                    body: JSON.stringify({ checklist: vfChecklist, business_description: vfDescription, portfolio_urls: urls }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    setVerifiedFinishStatus('pending');
                    showToast('Application submitted!');
                  } else {
                    showToast(data.error || 'Failed to submit');
                  }
                } catch { showToast('Failed to submit application'); }
                finally { setVfApplying(false); }
              }}
              disabled={vfApplying || !Object.values(vfChecklist).every(v => v)}
              className="w-full py-3 bg-v-gold text-v-charcoal font-semibold text-xs uppercase tracking-widest rounded hover:bg-v-gold-dim disabled:opacity-50 transition-colors"
            >
              {vfApplying ? 'Submitting...' : 'Submit Application'}
            </button>
          </div>
        )}
      </div>

      {/* Certifications */}
      <div>
        <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Certifications</label>

        {verifiedFinish && (
          <div className="mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-v-gold/15 border border-v-gold/30 rounded text-v-gold text-xs font-semibold">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              Verified Finish Certified
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-3">
          {certifications.map(cert => (
            <span key={cert} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs rounded-full">
              {cert}
              <button onClick={() => setCertifications(prev => prev.filter(c => c !== cert))} className="hover:text-red-400 text-blue-400/60">&times;</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newCert} onChange={e => setNewCert(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newCert.trim() && !certifications.includes(newCert.trim())) { setCertifications([...certifications, newCert.trim()]); setNewCert(''); } } }}
            placeholder="Add a certification... e.g. Shiny Jets 5-Day, Detail King, NASM" className={cls} />
          <button onClick={() => { if (newCert.trim() && !certifications.includes(newCert.trim())) { setCertifications([...certifications, newCert.trim()]); setNewCert(''); } }}
            className="px-4 py-2 bg-v-gold text-v-charcoal text-xs font-semibold rounded whitespace-nowrap">Add</button>
        </div>
      </div>

      {/* Services preview */}
      {services.length > 0 && (
        <div>
          <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Services (from your settings)</label>
          <div className="flex flex-wrap gap-1">
            {services.map(s => <span key={s} className="text-xs bg-v-surface border border-v-border px-2 py-1 rounded text-v-text-secondary">{s}</span>)}
          </div>
        </div>
      )}

      {/* Save */}
      <button onClick={handleSave} disabled={saving}
        className="w-full py-3 bg-v-gold text-v-charcoal font-semibold text-xs uppercase tracking-widest rounded hover:bg-v-gold-dim disabled:opacity-50 transition-colors">
        {saving ? 'Saving...' : 'Save Directory Settings'}
      </button>
    </div>
  );
}
