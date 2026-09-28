"use client";
import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const CRM_LABELS = {
  jobber: 'Jobber',
  housecall_pro: 'HouseCall Pro',
  servicetitan: 'ServiceTitan',
  quickbooks: 'QuickBooks',
  generic: 'CSV',
};

const TARGET_FIELDS = [
  { value: 'skip', label: '-- Skip --' },
  { value: 'name', label: 'Customer Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'company_name', label: 'Company Name' },
  { value: 'notes', label: 'Notes' },
  { value: 'tags', label: 'Tags' },
  { value: 'tail_number', label: 'Tail Number' },
  { value: 'aircraft_type', label: 'Aircraft Make' },
  { value: 'aircraft_model', label: 'Aircraft Model' },
  { value: 'total_price', label: 'Total Price / Revenue' },
  { value: 'service_name', label: 'Service / Job Type' },
];

const SUPPORTED_FORMATS = [
  { name: 'CSV', desc: 'Universal format - works from any CRM', ext: '.csv' },
  { name: 'Excel', desc: 'Export as CSV from Excel first', ext: '.xlsx/.csv' },
  { name: 'ServiceTitan', desc: 'Customer & job exports', ext: '.csv' },
  { name: 'Jobber', desc: 'Client & work order exports', ext: '.csv' },
  { name: 'HouseCall Pro', desc: 'Customer & job exports', ext: '.csv' },
  { name: 'QuickBooks', desc: 'Customer list export', ext: '.csv' },
];

export default function ImportExportPage() {
  const router = useRouter();
  const fileRef = useRef(null);
  const [step, setStep] = useState(0); // 0=choose, 1=upload, 2=map, 3=preview, 4=importing, 5=done
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Import state
  const [selectedFormat, setSelectedFormat] = useState(null);
  const [fileName, setFileName] = useState('');
  const [parseResult, setParseResult] = useState(null);
  const [mapping, setMapping] = useState({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importResults, setImportResults] = useState(null);
  const [progress, setProgress] = useState(0);

  // Export state
  const [exporting, setExporting] = useState(false);

  const getToken = () => localStorage.getItem('vector_token');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // Upload and parse file
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setError('');
    setLoading(true);
    setFileName(file.name);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/settings/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setParseResult(data);
      setMapping(data.mapping || {});
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  };

  // Execute import
  const executeImport = async () => {
    setStep(4);
    setProgress(0);
    setError('');

    const rows = parseResult.preview; // We sent full data from server but display preview
    // We need to re-send the file with mapping to execute
    // Actually the server already has the data in parseResult - let's send it
    // For large files we'll batch

    const allRows = parseResult.preview; // The API returned up to 10 preview rows
    // But we need ALL rows - re-upload the file
    const fileInput = fileRef.current;

    try {
      // We'll use the PUT endpoint with all parsed data
      // The parseResult contains totalRows but only preview of 10
      // We need to re-upload for full import
      const formData = new FormData();
      if (fileInput?.files[0]) {
        formData.append('file', fileInput.files[0]);
      }

      // First re-parse to get all rows
      const parseRes = await fetch('/api/settings/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const fullParse = await parseRes.json();
      if (!parseRes.ok) throw new Error(fullParse.error);

      // Now we have all rows in fullParse - but the API only returns preview
      // The actual import needs all rows sent to PUT
      // Let's batch through the data using the file directly
      // Actually, let me reconsider: the POST returns preview (10 rows) + totalRows count
      // For the PUT, we need to send ALL rows
      // Solution: have the client parse the CSV and send all rows

      const file = fileInput?.files[0];
      if (!file) throw new Error('Please re-select your file');
      const text = await file.text();
      const allParsedRows = parseClientCSV(text);

      // Batch in chunks of 50
      const BATCH = 50;
      let totalDone = 0;
      const combinedResults = { customers: 0, aircraft: 0, quotes: 0, skipped: 0, errors: [] };

      for (let i = 0; i < allParsedRows.length; i += BATCH) {
        const batch = allParsedRows.slice(i, i + BATCH);
        const res = await fetch('/api/settings/import', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ rows: batch, mapping, skipDuplicates }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        combinedResults.customers += data.results.customers;
        combinedResults.quotes += data.results.quotes;
        combinedResults.skipped += data.results.skipped;
        if (data.results.errors?.length) combinedResults.errors.push(...data.results.errors);

        totalDone += batch.length;
        setProgress(Math.round((totalDone / allParsedRows.length) * 100));
      }

      setImportResults(combinedResults);
      setStep(5);
    } catch (err) {
      setError(err.message);
      setStep(3);
    }
  };

  // Client-side CSV parser for sending full data
  function parseClientCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQ = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (inQ && text[i + 1] === '"') { field += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        row.push(field.trim()); field = '';
      } else if ((ch === '\n' || ch === '\r') && !inQ) {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field.trim()); field = '';
        if (row.some(f => f !== '')) rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
    if (field || row.length) { row.push(field.trim()); if (row.some(f => f !== '')) rows.push(row); }

    if (rows.length < 2) return [];
    const headers = rows[0];
    return rows.slice(1).map(r => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = r[idx] || ''; });
      return obj;
    });
  }

  // Export all data
  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      const res = await fetch('/api/settings/export', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.upgrade) {
          setError('Data export is included with Lite ($39.95/mo) and Business. Upgrade at /upgrade.');
          return;
        }
        throw new Error(data.error);
      }

      // Download each CSV file
      for (const [filename, content] of Object.entries(data.files)) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }

      const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
      showToast(`Exported ${total} records across ${Object.keys(data.files).length} files`);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-4xl">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">
          {toast}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/40 text-red-300 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-400 hover:text-white">dismiss</button>
        </div>
      )}

      {/* ===== STEP 0: Choose action ===== */}
      {step === 0 && (
        <>
          {/* Import Section */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-6 mb-6">
            <h2 className="text-xl font-bold text-white mb-1">Import Data</h2>
            <p className="text-white/50 text-sm mb-6">Migrate your customers, jobs, and revenue from another CRM</p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {SUPPORTED_FORMATS.map((fmt) => (
                <button
                  key={fmt.name}
                  onClick={() => { setSelectedFormat(fmt.name); setStep(1); setTimeout(() => fileRef.current?.click(), 100); }}
                  className="bg-white/5 border border-white/10 rounded-lg p-4 text-left hover:border-v-gold/50 hover:bg-white/[0.08] transition-all cursor-pointer group"
                >
                  <div className="text-white font-medium text-sm group-hover:text-v-gold transition-colors">{fmt.name}</div>
                  <div className="text-white/40 text-xs mt-1">{fmt.desc}</div>
                  <div className="text-white/30 text-[10px] mt-2">{fmt.ext}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Export Section */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-6">
            <h2 className="text-xl font-bold text-white mb-1">Export My Data</h2>
            <p className="text-white/50 text-sm mb-4">
              Download all your data as CSV files. Includes customers, quotes, services, and products.
              Great for backups and data portability.
            </p>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="border border-white/20 text-white px-6 py-3 rounded-lg hover:bg-white/10 transition disabled:opacity-50"
            >
              {exporting ? 'Exporting...' : 'Download All Data (CSV)'}
            </button>
          </div>
        </>
      )}

      {/* ===== STEP 1: Upload file ===== */}
      {step === 1 && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Step 1: Upload File</h2>
            <button onClick={() => setStep(0)} className="text-white/50 hover:text-white text-sm">Cancel</button>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition ${
              dragOver
                ? 'border-v-gold bg-v-gold/10'
                : 'border-white/20 hover:border-white/40'
            }`}
          >
            <div className="text-4xl mb-3">
              {loading ? (
                <div className="inline-block w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin" />
              ) : '📄'}
            </div>
            <p className="text-white font-medium">
              {loading ? 'Parsing file...' : 'Drag & drop your CSV file here'}
            </p>
            <p className="text-white/40 text-sm mt-1">or click to browse</p>
            <p className="text-white/30 text-xs mt-3">
              Supports CSV, TSV, and tab-delimited text files
            </p>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx"
            onChange={onFileSelect}
            className="hidden"
          />

          <div className="mt-6 bg-white/5 rounded-lg p-4">
            <p className="text-white/60 text-sm font-medium mb-2">How to export from your CRM:</p>
            <div className="space-y-2 text-white/40 text-xs">
              <p><span className="text-white/60">ServiceTitan:</span> Reports &gt; Customer List &gt; Export CSV</p>
              <p><span className="text-white/60">Jobber:</span> Clients &gt; Export &gt; Download CSV</p>
              <p><span className="text-white/60">HouseCall Pro:</span> Customers &gt; Export</p>
              <p><span className="text-white/60">QuickBooks:</span> Sales &gt; Customers &gt; Export to Excel &gt; Save as CSV</p>
            </div>
          </div>
        </div>
      )}

      {/* ===== STEP 2: Map columns ===== */}
      {step === 2 && parseResult && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Step 2: Map Columns</h2>
            <button onClick={() => setStep(0)} className="text-white/50 hover:text-white text-sm">Cancel</button>
          </div>

          {parseResult.detectedCRM !== 'generic' && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2 mb-4 text-sm text-green-300">
              Detected: <strong>{CRM_LABELS[parseResult.detectedCRM] || parseResult.detectedCRM}</strong> format - columns auto-mapped
            </div>
          )}

          <p className="text-white/50 text-sm mb-4">
            {parseResult.totalRows} rows found in <span className="text-white/70">{fileName}</span>.
            Match your file columns to Shiny Jets CRM fields.
          </p>

          <div className="space-y-2 mb-6">
            {parseResult.headers.map((header) => (
              <div key={header} className="flex items-center gap-3 bg-white/5 rounded-lg px-4 py-2">
                <div className="w-1/2 text-white text-sm font-mono truncate" title={header}>{header}</div>
                <div className="text-white/30">&#8594;</div>
                <select
                  value={mapping[header] || 'skip'}
                  onChange={(e) => setMapping(prev => ({ ...prev, [header]: e.target.value }))}
                  className="w-1/2 bg-white/10 border border-white/20 text-white text-sm rounded px-3 py-1.5 focus:border-v-gold outline-none"
                >
                  {TARGET_FIELDS.map(f => (
                    <option key={f.value} value={f.value} className="bg-gray-900">{f.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Preview first 5 rows */}
          <div className="mb-6">
            <h3 className="text-white/70 text-sm font-medium mb-2">Preview (first 5 rows)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    {parseResult.headers.map(h => (
                      <th key={h} className="text-left text-white/40 px-2 py-1 border-b border-white/10 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parseResult.preview.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {parseResult.headers.map(h => (
                        <td key={h} className="text-white/60 px-2 py-1 border-b border-white/5 whitespace-nowrap max-w-[200px] truncate">{row[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button
            onClick={() => setStep(3)}
            className="bg-gradient-to-r from-v-gold to-v-gold-dim text-white font-semibold px-6 py-3 rounded-lg hover:opacity-90 transition"
          >
            Continue to Preview
          </button>
        </div>
      )}

      {/* ===== STEP 3: Preview & confirm ===== */}
      {step === 3 && parseResult && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Step 3: Confirm Import</h2>
            <button onClick={() => setStep(2)} className="text-white/50 hover:text-white text-sm">Back</button>
          </div>

          {/* Counts */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white/5 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-white">{parseResult.totalRows}</div>
              <div className="text-white/50 text-xs mt-1">Total Rows</div>
            </div>
            <div className="bg-white/5 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-white">{parseResult.counts.customers}</div>
              <div className="text-white/50 text-xs mt-1">Customers</div>
            </div>
            <div className="bg-white/5 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-white">{parseResult.counts.quotes}</div>
              <div className="text-white/50 text-xs mt-1">Jobs / Revenue</div>
            </div>
          </div>

          {/* Duplicates warning */}
          {parseResult.duplicates > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3 mb-4">
              <p className="text-yellow-300 text-sm font-medium">
                {parseResult.duplicates} duplicate email{parseResult.duplicates !== 1 ? 's' : ''} found
              </p>
              <label className="flex items-center gap-2 mt-2 text-white/60 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  className="rounded"
                />
                Skip duplicates (don&apos;t update existing records)
              </label>
            </div>
          )}

          {/* Column mapping summary */}
          <div className="bg-white/5 rounded-lg p-4 mb-6">
            <h3 className="text-white/70 text-sm font-medium mb-2">Column Mapping</h3>
            <div className="grid grid-cols-2 gap-1 text-xs">
              {Object.entries(mapping).filter(([, v]) => v !== 'skip').map(([src, dest]) => (
                <div key={src} className="flex gap-2">
                  <span className="text-white/40 font-mono">{src}</span>
                  <span className="text-white/30">&#8594;</span>
                  <span className="text-v-gold">{TARGET_FIELDS.find(f => f.value === dest)?.label || dest}</span>
                </div>
              ))}
            </div>
            {Object.entries(mapping).filter(([, v]) => v === 'skip').length > 0 && (
              <p className="text-white/30 text-xs mt-2">
                {Object.entries(mapping).filter(([, v]) => v === 'skip').length} column(s) will be skipped
              </p>
            )}
          </div>

          <button
            onClick={executeImport}
            className="bg-gradient-to-r from-v-gold to-v-gold-dim text-white font-semibold px-8 py-3 rounded-lg hover:opacity-90 transition text-lg"
          >
            Import {parseResult.totalRows} Records
          </button>
        </div>
      )}

      {/* ===== STEP 4: Importing ===== */}
      {step === 4 && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-6 text-center">
          <h2 className="text-xl font-bold text-white mb-6">Importing Data...</h2>
          <div className="max-w-md mx-auto mb-4">
            <div className="bg-white/10 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-v-gold to-v-gold-dim h-full rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-white/50 text-sm mt-2">{progress}% complete</p>
          </div>
          <p className="text-white/40 text-xs">Please don&apos;t close this page</p>
        </div>
      )}

      {/* ===== STEP 5: Done ===== */}
      {step === 5 && importResults && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-6 text-center">
          <div className="text-4xl mb-3">&#10003;</div>
          <h2 className="text-xl font-bold text-white mb-2">Import Complete</h2>

          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto my-6">
            <div className="bg-white/5 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-400">{importResults.customers}</div>
              <div className="text-white/50 text-xs">Customers</div>
            </div>
            <div className="bg-white/5 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-400">{importResults.quotes}</div>
              <div className="text-white/50 text-xs">Quotes/Jobs</div>
            </div>
            <div className="bg-white/5 rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-400">{importResults.skipped}</div>
              <div className="text-white/50 text-xs">Skipped</div>
            </div>
          </div>

          {importResults.errors?.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mt-4 text-left max-w-lg mx-auto">
              <p className="text-red-300 text-sm font-medium mb-2">{importResults.errors.length} error(s):</p>
              <div className="max-h-32 overflow-y-auto text-xs text-red-300/70 space-y-1">
                {importResults.errors.slice(0, 20).map((e, i) => <p key={i}>{e}</p>)}
                {importResults.errors.length > 20 && <p>...and {importResults.errors.length - 20} more</p>}
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-center mt-6">
            <button
              onClick={() => router.push('/customers')}
              className="bg-gradient-to-r from-v-gold to-v-gold-dim text-white font-semibold px-6 py-3 rounded-lg hover:opacity-90"
            >
              View Customers
            </button>
            <button
              onClick={() => { setStep(0); setParseResult(null); setImportResults(null); setFileName(''); }}
              className="border border-white/20 text-white px-6 py-3 rounded-lg hover:bg-white/10"
            >
              Import More
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
