"use client";
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useToast } from '@/components/Toast';
import AddCustomerModal from '@/components/AddCustomerModal';
import AppShell from '@/components/AppShell';

const TAG_COLORS = {
  'VIP': 'bg-transparent text-v-gold border-v-gold/50',
  'Recurring': 'bg-transparent text-cyan-400 border-cyan-400/40',
  'Corporate': 'bg-transparent text-v-gold-dim border-v-gold-dim/40',
  'FBO': 'bg-transparent text-emerald-400 border-emerald-400/40',
  'Owner-Pilot': 'bg-transparent text-orange-400 border-orange-400/40',
  'Fleet': 'bg-transparent text-v-gold border-v-gold/40',
  'Referral': 'bg-transparent text-pink-400 border-pink-400/40',
  'High-Value': 'bg-transparent text-teal-400 border-teal-400/40',
  'Prospect': 'bg-transparent text-sky-400 border-sky-400/40',
  'Inactive': 'bg-transparent text-gray-500 border-gray-500/40',
  'Charter': 'bg-transparent text-rose-400 border-rose-400/40',
  'Private': 'bg-transparent text-v-gold-dim border-v-gold-dim/40',
};

function getTagStyle(tagName) {
  return TAG_COLORS[tagName] || 'bg-transparent text-gray-500 border-gray-500/40';
}

export default function CustomersPage() {
  const router = useRouter();
  const { success: toastSuccess, error: toastError } = useToast();
  const [customers, setCustomers] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkTagModal, setBulkTagModal] = useState(false);
  const [bulkTagAction, setBulkTagAction] = useState('add');
  const [bulkTagSelection, setBulkTagSelection] = useState([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [editTags, setEditTags] = useState([]);
  const [editSaving, setEditSaving] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6b7280');
  const [creatingTag, setCreatingTag] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);

  // QuickBooks import state
  const [qbConnected, setQbConnected] = useState(false);
  const [qbImporting, setQbImporting] = useState(false);

  // Add Customer modal state
  const [showAddModal, setShowAddModal] = useState(false);

  // Sorting state
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');

  // Bulk delete state
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Email blast modal state
  const [emailBlastModal, setEmailBlastModal] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  // Gmail-style view mode + archive
  const [viewMode, setViewMode] = useState('active');
  const [archiving, setArchiving] = useState(false);

  const fetchData = async (archived = false) => {
    const token = localStorage.getItem('vector_token');
    try {
      const [custRes, tagsRes] = await Promise.all([
        fetch(`/api/customers?limit=500&archived=${archived}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/customers/tags', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (custRes.ok) {
        const data = await custRes.json();
        setCustomers(data.customers || []);
      }
      if (tagsRes.ok) {
        const data = await tagsRes.json();
        setAllTags(data.tags || []);
      }
      // Check QuickBooks connection (non-blocking)
      fetch('/api/quickbooks/status', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.connected && data?.status === 'ACTIVE') setQbConnected(true); })
        .catch(() => {});
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
    fetchData(viewMode === 'archived');
  }, [viewMode]);

  const switchView = (mode) => {
    if (mode === viewMode) return;
    setViewMode(mode);
    setSelectedIds(new Set());
    setSearch('');
    setFilterTag('');
  };

  const handleQBImport = async () => {
    setQbImporting(true);
    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch('/api/quickbooks/import-customers', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        toastSuccess(`Imported ${data.imported} customers from QuickBooks`);
        fetchData(viewMode === 'archived');
      } else {
        toastError(data.error || 'Import failed');
      }
    } catch (err) {
      toastError('Import failed');
    } finally {
      setQbImporting(false);
    }
  };

  // Sorting + filtering
  const filteredCustomers = useMemo(() => {
    let result = customers;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.company_name || '').toLowerCase().includes(q)
      );
    }
    if (filterTag) {
      result = result.filter(c =>
        Array.isArray(c.tags) && c.tags.includes(filterTag)
      );
    }
    // Sort
    result = [...result].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (sortField === 'quote_count' || sortField === 'total_revenue') {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      if (sortField === 'created_at' || sortField === 'last_service_date') {
        return sortDir === 'asc'
          ? new Date(aVal) - new Date(bVal)
          : new Date(bVal) - new Date(aVal);
      }
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [customers, search, filterTag, sortField, sortDir]);

  // Unique tags across all customers
  const usedTags = useMemo(() => {
    const tagSet = new Set();
    customers.forEach(c => {
      if (Array.isArray(c.tags)) c.tags.forEach(t => tagSet.add(t));
    });
    allTags.forEach(t => tagSet.add(t.name));
    return Array.from(tagSet).sort();
  }, [customers, allTags]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCustomers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCustomers.map(c => c.id).filter(Boolean)));
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  };

  const SortArrow = ({ field }) => {
    if (sortField !== field) return <span className="text-v-text-secondary/30 ml-1">&#8597;</span>;
    return <span className="text-v-gold ml-1">{sortDir === 'asc' ? '&#9650;' : '&#9660;'}</span>;
  };

  // Bulk archive / unarchive
  const bulkArchive = async (archive = true) => {
    setArchiving(true);
    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch('/api/customers/bulk-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customerIds: Array.from(selectedIds), archived: archive }),
      });
      if (res.ok) {
        setCustomers(prev => prev.filter(c => !selectedIds.has(c.id)));
        const count = selectedIds.size;
        setSelectedIds(new Set());
        toastSuccess(`${archive ? 'Archived' : 'Unarchived'} ${count} customer${count !== 1 ? 's' : ''}`);
      } else {
        const data = await res.json();
        toastError(data.error || `Failed to ${archive ? 'archive' : 'unarchive'}`);
      }
    } catch {
      toastError(`Failed to ${archive ? 'archive' : 'unarchive'}`);
    } finally {
      setArchiving(false);
    }
  };

  // Bulk delete selected (permanent — with confirmation)
  const bulkDelete = async () => {
    const count = selectedIds.size;
    if (!confirm(`Permanently delete ${count} customer${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    const token = localStorage.getItem('vector_token');
    let deleted = 0;
    for (const id of selectedIds) {
      try {
        const res = await fetch(`/api/customers/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) deleted++;
      } catch {}
    }
    setCustomers(prev => prev.filter(c => !selectedIds.has(c.id)));
    setSelectedIds(new Set());
    setBulkDeleting(false);
    toastSuccess(`Deleted ${deleted} customer${deleted !== 1 ? 's' : ''}`);
  };

  // Move selected to VIP
  const moveToVip = async () => {
    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch('/api/customers/bulk-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'add', customerIds: Array.from(selectedIds), tags: ['VIP'] }),
      });
      if (res.ok) {
        setCustomers(prev => prev.map(c => {
          if (!selectedIds.has(c.id)) return c;
          const current = Array.isArray(c.tags) ? c.tags : [];
          return { ...c, tags: current.includes('VIP') ? current : [...current, 'VIP'] };
        }));
        toastSuccess(`Marked ${selectedIds.size} customer${selectedIds.size !== 1 ? 's' : ''} as VIP`);
        setSelectedIds(new Set());
      }
    } catch {
      toastError('Failed to update VIP status');
    }
  };

  // Export selected (or all) to CSV
  const exportCsv = () => {
    const rows = selectedIds.size > 0
      ? filteredCustomers.filter(c => selectedIds.has(c.id))
      : filteredCustomers;

    const headers = ['Company Name', 'Contact Name', 'Email', 'Phone', 'Tags', 'Total Quotes', 'Total Revenue', 'Date Added'];
    const csvRows = [headers.join(',')];

    for (const c of rows) {
      const escape = (val) => {
        if (val == null) return '';
        const s = String(val);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };
      csvRows.push([
        escape(c.company_name),
        escape(c.name),
        escape(c.email),
        escape(c.phone),
        escape(Array.isArray(c.tags) ? c.tags.join('; ') : ''),
        c.quote_count || 0,
        `$${(c.total_revenue || 0).toFixed(2)}`,
        c.created_at ? new Date(c.created_at).toLocaleDateString() : '',
      ].join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toastSuccess(`Exported ${rows.length} customers`);
  };

  // Send email blast
  const sendEmailBlast = async () => {
    if (!emailSubject.trim() || !emailMessage.trim()) return;
    setEmailSending(true);
    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch('/api/customers/email-blast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          customerIds: Array.from(selectedIds),
          subject: emailSubject,
          message: emailMessage,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toastSuccess(`Sent to ${data.sent} of ${data.total} customers`);
        setEmailBlastModal(false);
        setEmailSubject('');
        setEmailMessage('');
        setSelectedIds(new Set());
      } else {
        toastError(data.error || 'Failed to send');
      }
    } catch {
      toastError('Failed to send emails');
    } finally {
      setEmailSending(false);
    }
  };

  // Save tags for a single customer
  const saveCustomerTags = async (customerId, tags) => {
    setEditSaving(true);
    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch('/api/customers/bulk-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'set', customerIds: [customerId], tags }),
      });
      if (res.ok) {
        setCustomers(prev => prev.map(c =>
          c.id === customerId ? { ...c, tags } : c
        ));
        setEditCustomer(null);
        toastSuccess('Tags saved');
      }
    } catch (err) {
      console.error('Failed to save tags:', err);
    } finally {
      setEditSaving(false);
    }
  };

  // Bulk tag action
  const executeBulkTag = async () => {
    if (bulkTagSelection.length === 0) return;
    setBulkProcessing(true);
    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch('/api/customers/bulk-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: bulkTagAction,
          customerIds: Array.from(selectedIds),
          tags: bulkTagSelection,
        }),
      });
      if (res.ok) {
        setCustomers(prev => prev.map(c => {
          if (!selectedIds.has(c.id)) return c;
          const current = Array.isArray(c.tags) ? c.tags : [];
          let newTags;
          if (bulkTagAction === 'add') {
            const tagSet = new Set(current);
            bulkTagSelection.forEach(t => tagSet.add(t));
            newTags = Array.from(tagSet);
          } else if (bulkTagAction === 'remove') {
            newTags = current.filter(t => !bulkTagSelection.includes(t));
          } else {
            newTags = [...bulkTagSelection];
          }
          return { ...c, tags: newTags };
        }));
        setSelectedIds(new Set());
        setBulkTagModal(false);
        setBulkTagSelection([]);
        toastSuccess('Tags updated');
      }
    } catch (err) {
      console.error('Bulk tag error:', err);
    } finally {
      setBulkProcessing(false);
    }
  };

  // Create custom tag
  const createTag = async () => {
    if (!newTagName.trim()) return;
    setCreatingTag(true);
    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch('/api/customers/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });
      if (res.ok) {
        const data = await res.json();
        setAllTags(prev => [...prev, data.tag]);
        setNewTagName('');
        setNewTagColor('#6b7280');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create');
      }
    } catch (err) {
      console.error('Create tag error:', err);
    } finally {
      setCreatingTag(false);
    }
  };

  const deleteTag = async (tagId) => {
    if (!confirm('Delete this custom tag? It will not be removed from customers.')) return;
    const token = localStorage.getItem('vector_token');
    try {
      await fetch(`/api/customers/tags?id=${tagId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setAllTags(prev => prev.filter(t => t.id !== tagId));
    } catch (err) {
      console.error('Delete tag error:', err);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  };

  const formatCurrency = (val) => {
    if (!val) return '$0';
    return '$' + Number(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const hasSelection = selectedIds.size > 0;

  if (loading) {
    return <LoadingSpinner message="Loading..." />;
  }

  return (
    <AppShell title="Customers">
    <div className="px-6 md:px-10 py-8 pb-40 max-w-[1400px]">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <h1 className="font-heading text-[2rem] font-light text-v-text-primary" style={{ letterSpacing: '0.15em' }}>CUSTOMERS</h1>
          <p className="text-sm text-v-text-secondary">
            {customers.length} {viewMode === 'archived' ? 'archived' : 'total'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {qbConnected && (
            <button
              onClick={handleQBImport}
              disabled={qbImporting}
              className="px-3 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-500/30 disabled:opacity-50 text-sm font-medium"
            >
              {qbImporting ? 'Importing...' : 'Import from QB'}
            </button>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-v-gold text-v-charcoal rounded-sm hover:bg-v-gold-dim text-sm font-medium"
          >
            + Add Customer
          </button>
          <button
            onClick={() => setShowTagManager(!showTagManager)}
            className="px-3 py-2 border border-v-gold/30 text-v-text-primary rounded-sm hover:border-v-gold text-sm"
          >
            Manage Tags
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto">
        {/* Tag Manager Panel */}
        {showTagManager && (
          <div className="bg-v-surface border border-v-border rounded p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-light tracking-wide text-v-text-primary">Manage Tags</h2>
              <button onClick={() => setShowTagManager(false)} className="text-v-text-secondary hover:text-v-text-primary">&times;</button>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {allTags.map((tag) => (
                <span key={tag.id || tag.name} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-sm font-medium border ${getTagStyle(tag.name)}`}>
                  {tag.name}
                  {!tag.is_default && tag.id && !String(tag.id).startsWith('default_') && (
                    <button
                      onClick={() => deleteTag(tag.id)}
                      className="ml-1 text-current opacity-50 hover:opacity-100"
                    >
                      &times;
                    </button>
                  )}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createTag()}
                placeholder="Tag name"
                className="bg-v-surface-light border border-v-border rounded px-3 py-2 text-sm flex-1 text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50"
              />
              <input
                type="color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                className="w-10 h-10 border border-v-border rounded cursor-pointer bg-v-surface-light"
              />
              <button
                onClick={createTag}
                disabled={creatingTag || !newTagName.trim()}
                className="px-4 py-2 bg-v-gold text-v-charcoal rounded hover:bg-v-gold-dim disabled:opacity-50 text-sm font-medium"
              >
                {creatingTag ? '...' : 'Create'}
              </button>
            </div>
          </div>
        )}

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers..."
            className="flex-1 bg-v-surface border border-v-border rounded px-4 py-2 text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50"
          />
          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            className="w-full sm:w-auto bg-v-surface border border-v-border rounded px-4 py-2 text-v-text-primary text-sm outline-none focus:border-v-gold/50"
          >
            <option value="">All Tags</option>
            {usedTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>

        {/* Active / Archived Toggle */}
        <div className="flex items-center gap-1 mb-4">
          <button
            onClick={() => switchView('active')}
            className={`px-3 py-1.5 text-sm rounded-sm font-medium transition-colors ${
              viewMode === 'active'
                ? 'bg-v-gold/20 text-v-gold border border-v-gold/30'
                : 'text-v-text-secondary hover:text-v-text-primary border border-transparent'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => switchView('archived')}
            className={`px-3 py-1.5 text-sm rounded-sm font-medium transition-colors ${
              viewMode === 'archived'
                ? 'bg-v-gold/20 text-v-gold border border-v-gold/30'
                : 'text-v-text-secondary hover:text-v-text-primary border border-transparent'
            }`}
          >
            Archived
          </button>
        </div>

        {/* Gmail-style Action Toolbar — rendered OUTSIDE overflow-hidden container */}
        {hasSelection && (
          <div className="bg-v-surface border border-v-border/30 rounded-t-sm px-4 py-2.5 hidden sm:flex items-center gap-1 relative z-10">
            <input
              type="checkbox"
              checked={selectedIds.size === filteredCustomers.length}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-v-border accent-v-gold cursor-pointer mr-3"
            />
            <span className="text-sm font-medium text-v-text-primary">{selectedIds.size} selected</span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="ml-1 mr-2 text-v-text-secondary hover:text-v-text-primary cursor-pointer"
              title="Clear selection"
            >
              <svg className="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            <div className="flex items-center gap-0.5 border-l border-v-border/30 pl-2">
              {/* Archive / Unarchive */}
              {viewMode === 'active' ? (
                <button
                  type="button"
                  onClick={() => bulkArchive(true)}
                  disabled={archiving}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-v-text-secondary hover:text-v-text-primary hover:bg-v-surface-light rounded transition-colors disabled:opacity-50 cursor-pointer"
                  title="Archive"
                >
                  <svg className="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-2-3H6L4 7m16 0v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7m16 0H4m8 4v6m0 0l-3-3m3 3l3-3" /></svg>
                  <span className="hidden lg:inline">Archive</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => bulkArchive(false)}
                  disabled={archiving}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-v-text-secondary hover:text-v-text-primary hover:bg-v-surface-light rounded transition-colors disabled:opacity-50 cursor-pointer"
                  title="Unarchive"
                >
                  <svg className="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 17l2 3h12l2-3M4 17V7m16 10V7M4 17h16M4 7l2-3h12l2 3M4 7h16m-8-2v6m0 0l3-3m-3 3l-3-3" /></svg>
                  <span className="hidden lg:inline">Unarchive</span>
                </button>
              )}

              {/* Delete */}
              <button
                type="button"
                onClick={bulkDelete}
                disabled={bulkDeleting}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50 cursor-pointer"
                title="Delete permanently"
              >
                <svg className="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                <span className="hidden lg:inline">Delete</span>
              </button>

              {/* Tag */}
              <button
                type="button"
                onClick={() => { setBulkTagModal(true); setBulkTagAction('add'); setBulkTagSelection([]); }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-v-text-secondary hover:text-v-text-primary hover:bg-v-surface-light rounded transition-colors cursor-pointer"
                title="Manage tags"
              >
                <svg className="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>
                <span className="hidden lg:inline">Tag</span>
              </button>

              {/* VIP */}
              <button
                type="button"
                onClick={moveToVip}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-v-gold/70 hover:text-v-gold hover:bg-v-gold/10 rounded transition-colors cursor-pointer"
                title="Mark as VIP"
              >
                <svg className="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                <span className="hidden lg:inline">VIP</span>
              </button>

              {/* Email */}
              <button
                type="button"
                onClick={() => { setEmailBlastModal(true); setEmailSubject(''); setEmailMessage(''); }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-v-text-secondary hover:text-v-text-primary hover:bg-v-surface-light rounded transition-colors cursor-pointer"
                title="Send email blast"
              >
                <svg className="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                <span className="hidden lg:inline">Email</span>
              </button>

              {/* Export */}
              <button
                type="button"
                onClick={exportCsv}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-v-text-secondary hover:text-v-text-primary hover:bg-v-surface-light rounded transition-colors cursor-pointer"
                title="Export to CSV"
              >
                <svg className="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                <span className="hidden lg:inline">Export</span>
              </button>
            </div>
          </div>
        )}

        {/* Customer List */}
        <div className={`bg-v-surface ${hasSelection ? 'rounded-b-sm' : 'rounded-sm'} overflow-hidden`}>
          {/* Column headers (only when no selection) */}
          {!hasSelection && (
            <div className="border-b border-v-border/30 px-4 py-2.5 hidden sm:grid sm:grid-cols-14 gap-4 items-center text-xs font-medium text-v-text-secondary uppercase tracking-widest">
              <div className="col-span-1">
                <input
                  type="checkbox"
                  checked={filteredCustomers.length > 0 && selectedIds.size === filteredCustomers.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-v-border text-v-gold cursor-pointer accent-v-gold"
                />
              </div>
              <div className="col-span-4 cursor-pointer select-none hover:text-v-text-primary" onClick={() => handleSort('name')}>
                Customer <SortArrow field="name" />
              </div>
              <div className="col-span-3">Tags</div>
              <div className="col-span-2 cursor-pointer select-none hover:text-v-text-primary" onClick={() => handleSort('quote_count')}>
                Quotes <SortArrow field="quote_count" />
              </div>
              <div className="col-span-2 cursor-pointer select-none hover:text-v-text-primary" onClick={() => handleSort('total_revenue')}>
                Revenue <SortArrow field="total_revenue" />
              </div>
              <div className="col-span-2 cursor-pointer select-none hover:text-v-text-primary" onClick={() => handleSort('last_service_date')}>
                Activity <SortArrow field="last_service_date" />
              </div>
            </div>
          )}

          {/* Mobile Action Bar (fixed bottom when items selected) */}
          {hasSelection && (
            <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-v-surface border-t border-v-border px-4 py-3 z-40 flex items-center justify-between">
              <span className="text-sm text-v-text-primary font-medium">{selectedIds.size} selected</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => bulkArchive(viewMode === 'active')}
                  disabled={archiving}
                  className="text-v-text-secondary hover:text-v-text-primary disabled:opacity-50"
                  title={viewMode === 'active' ? 'Archive' : 'Unarchive'}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-2-3H6L4 7m16 0v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7m16 0H4m8 4v6m0 0l-3-3m3 3l3-3" /></svg>
                </button>
                <button
                  onClick={bulkDelete}
                  disabled={bulkDeleting}
                  className="text-red-400/70 hover:text-red-400 disabled:opacity-50"
                  title="Delete"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
                <button
                  onClick={() => { setBulkTagModal(true); setBulkTagAction('add'); setBulkTagSelection([]); }}
                  className="text-v-text-secondary hover:text-v-text-primary"
                  title="Tag"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-v-text-secondary hover:text-v-text-primary font-medium"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {filteredCustomers.length === 0 ? (
            customers.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-5xl mb-4 opacity-30">&#128100;</div>
                {viewMode === 'archived' ? (
                  <>
                    <h3 className="text-xl font-light tracking-wide text-v-text-primary mb-2">No archived customers</h3>
                    <p className="text-v-text-secondary mb-6 max-w-sm mx-auto">Archived customers will appear here.</p>
                  </>
                ) : (
                  <>
                    <h3 className="text-xl font-light tracking-wide text-v-text-primary mb-2">No customers yet</h3>
                    <p className="text-v-text-secondary mb-6 max-w-sm mx-auto">Add your first customer to start tracking quotes, services, and building relationships.</p>
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="px-6 py-3 bg-v-gold text-v-charcoal rounded font-medium hover:bg-v-gold-dim"
                    >
                      + Add Your First Customer
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-v-text-secondary">No results found</div>
            )
          ) : (
            <div className="divide-y divide-v-border/20">
              {filteredCustomers.map((customer) => {
                const tags = Array.isArray(customer.tags) ? customer.tags : [];
                const isSelected = selectedIds.has(customer.id);
                return (
                  <div key={customer.id || customer.email} className="hover:bg-v-surface-light transition-colors group">
                    {/* Mobile row */}
                    <div className="sm:hidden flex items-start gap-3 px-4 py-3">
                      {customer.id && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(customer.id)}
                          className="w-4 h-4 mt-1 accent-v-gold flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => customer.id && router.push(`/customers/${customer.id}`)}>
                        <p className="font-medium text-v-text-primary truncate">{customer.name || 'Name'}</p>
                        <p className="text-xs text-v-text-secondary truncate">{customer.email}</p>
                        {customer.company_name && <p className="text-xs text-v-text-secondary/60 truncate">{customer.company_name}</p>}
                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {tags.slice(0, 3).map(tag => (
                              <span key={tag} className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${getTagStyle(tag)}`}>{tag}</span>
                            ))}
                            {tags.length > 3 && <span className="text-[10px] text-v-text-secondary">+{tags.length - 3}</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Desktop row */}
                    <div className="hidden sm:grid sm:grid-cols-14 gap-4 items-center px-4 py-4">
                      {/* Checkbox — hidden by default, visible on hover or when items selected */}
                      <div className="col-span-1 flex items-center justify-center">
                        {customer.id && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(customer.id)}
                            className={`w-4 h-4 rounded border-v-border accent-v-gold cursor-pointer transition-opacity duration-150 ${
                              hasSelection ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}
                          />
                        )}
                      </div>

                      {/* Customer Info */}
                      <div className="col-span-4 cursor-pointer" onClick={() => customer.id && router.push(`/customers/${customer.id}`)}>
                        <p className="font-medium text-v-text-primary hover:text-v-gold">{customer.name || 'Name'}</p>
                        <p className="text-xs text-v-text-secondary">{customer.email}</p>
                        {customer.company_name && (
                          <p className="text-xs text-v-text-secondary/60">{customer.company_name}</p>
                        )}
                      </div>

                      {/* Tags */}
                      <div className="col-span-3">
                        <div className="flex flex-wrap gap-1 items-center">
                          {tags.includes('VIP') && (
                            <span key="vip-star" className="text-v-gold text-sm" title="VIP">&#9733;</span>
                          )}
                          {tags.filter(t => t !== 'VIP').map((tag) => (
                            <span key={tag} className={`px-2 py-0.5 rounded-sm text-xs font-medium border ${getTagStyle(tag)}`}>
                              {tag}
                            </span>
                          ))}
                          {customer.id && (
                            <button
                              onClick={() => {
                                setEditCustomer(customer);
                                setEditTags([...tags]);
                              }}
                              className="px-2 py-0.5 rounded text-xs text-v-text-secondary/50 border border-dashed border-v-border hover:border-v-gold/50 hover:text-v-gold"
                            >
                              + Tag
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Quotes */}
                      <div className="col-span-2 text-sm text-v-text-secondary">
                        {customer.quote_count || 0} {(customer.quote_count || 0) === 1 ? 'quote' : 'quotes'}
                      </div>

                      {/* Revenue */}
                      <div className="col-span-2 text-sm text-v-gold font-data">
                        {formatCurrency(customer.total_revenue)}
                      </div>

                      {/* Last Activity */}
                      <div className="col-span-2 text-sm text-v-text-secondary">
                        {formatDate(customer.last_service_date)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className="p-4 border-t border-v-border/30 text-sm text-v-text-secondary flex justify-between items-center">
            <span>Showing {filteredCustomers.length} of {customers.length} {viewMode === 'archived' ? 'archived ' : ''}customers</span>
            {!hasSelection && filteredCustomers.length > 0 && (
              <button onClick={exportCsv} className="text-xs text-v-gold hover:text-v-gold-dim font-medium">
                Export All CSV
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Edit Tags Modal (single customer) */}
      {editCustomer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-v-surface border border-v-border rounded-sm p-6 w-full max-w-md modal-glow">
            <h3 className="text-lg font-heading text-v-text-primary mb-1">Edit Tags</h3>
            <p className="text-sm text-v-text-secondary mb-4">{editCustomer.name} &mdash; {editCustomer.email}</p>

            <div className="flex flex-wrap gap-2 mb-4 min-h-[32px]">
              {editTags.length === 0 && (
                <span className="text-sm text-v-text-secondary/50">None</span>
              )}
              {editTags.map((tag) => (
                <span key={tag} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-sm font-medium border ${getTagStyle(tag)}`}>
                  {tag}
                  <button
                    onClick={() => setEditTags(prev => prev.filter(t => t !== tag))}
                    className="text-current opacity-50 hover:opacity-100"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>

            <p className="text-xs font-medium text-v-text-secondary uppercase tracking-wider mb-2">Available Tags</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {usedTags.filter(t => !editTags.includes(t)).map((tag) => (
                <button
                  key={tag}
                  onClick={() => setEditTags(prev => [...prev, tag])}
                  className={`px-2.5 py-1 rounded text-sm font-medium border cursor-pointer hover:opacity-80 ${getTagStyle(tag)}`}
                >
                  + {tag}
                </button>
              ))}
              {usedTags.filter(t => !editTags.includes(t)).length === 0 && (
                <span className="text-sm text-v-text-secondary/50">None</span>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setEditCustomer(null)} className="px-4 py-2 border border-v-border rounded text-v-text-secondary hover:text-v-text-primary hover:border-v-gold/50">
                Cancel
              </button>
              <button
                onClick={() => saveCustomerTags(editCustomer.id, editTags)}
                disabled={editSaving}
                className="px-4 py-2 bg-v-gold text-v-charcoal rounded hover:bg-v-gold-dim disabled:opacity-50"
              >
                {editSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      <AddCustomerModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        tags={usedTags}
        onSuccess={(data) => {
          if (data?.customer) {
            setCustomers(prev => [{ ...data.customer, quote_count: 0, total_revenue: 0, last_service_date: null }, ...prev]);
          }
          toastSuccess(data?.created ? 'Customer added!' : 'Customer saved!');
        }}
      />

      {/* Bulk Tag Modal */}
      {bulkTagModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-v-surface border border-v-border rounded-sm p-6 w-full max-w-md modal-glow">
            <h3 className="text-lg font-heading text-v-text-primary mb-1">Manage Tags</h3>
            <p className="text-sm text-v-text-secondary mb-4">{selectedIds.size} customer{selectedIds.size !== 1 ? 's' : ''} selected</p>

            <div className="flex gap-2 mb-4">
              {[
                { value: 'add', label: 'Add Tags' },
                { value: 'remove', label: 'Remove Tags' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setBulkTagAction(opt.value)}
                  className={`flex-1 py-2 px-3 rounded text-sm font-medium border ${
                    bulkTagAction === opt.value
                      ? 'bg-v-gold text-v-charcoal border-v-gold'
                      : 'bg-v-surface-light text-v-text-secondary border-v-border hover:text-v-text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              {usedTags.map((tag) => {
                const selected = bulkTagSelection.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => {
                      setBulkTagSelection(prev =>
                        selected ? prev.filter(t => t !== tag) : [...prev, tag]
                      );
                    }}
                    className={`px-3 py-1.5 rounded text-sm font-medium border transition-all ${
                      selected
                        ? 'bg-v-gold text-v-charcoal border-v-gold'
                        : `${getTagStyle(tag)} hover:opacity-80`
                    }`}
                  >
                    {selected ? '\u2713 ' : ''}{tag}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setBulkTagModal(false); setBulkTagSelection([]); }}
                className="px-4 py-2 border border-v-border rounded text-v-text-secondary hover:text-v-text-primary hover:border-v-gold/50"
              >
                Cancel
              </button>
              <button
                onClick={executeBulkTag}
                disabled={bulkProcessing || bulkTagSelection.length === 0}
                className="px-4 py-2 bg-v-gold text-v-charcoal rounded hover:bg-v-gold-dim disabled:opacity-50"
              >
                {bulkProcessing ? 'Processing...' : `${bulkTagAction === 'add' ? 'Add' : 'Remove'} Tags`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Blast Modal */}
      {emailBlastModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-v-surface border border-v-border rounded-t-lg sm:rounded-sm p-5 sm:p-6 w-full sm:max-w-lg modal-glow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-heading text-v-text-primary">Send Email Blast</h3>
              <button onClick={() => setEmailBlastModal(false)} className="text-v-text-secondary hover:text-v-text-primary text-xl">&times;</button>
            </div>
            <p className="text-sm text-v-text-secondary mb-4">Sending to {selectedIds.size} customer{selectedIds.size !== 1 ? 's' : ''}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="e.g. Spring scheduling is open!"
                  className="w-full bg-v-surface-light border border-v-border rounded px-3 py-2 text-sm text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">Message</label>
                <textarea
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  placeholder="Write your message..."
                  rows={6}
                  className="w-full bg-v-surface-light border border-v-border rounded px-3 py-2 text-sm text-v-text-primary placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEmailBlastModal(false)} className="px-4 py-2 border border-v-border rounded text-v-text-secondary hover:text-v-text-primary hover:border-v-gold/50">
                Cancel
              </button>
              <button
                onClick={sendEmailBlast}
                disabled={emailSending || !emailSubject.trim() || !emailMessage.trim()}
                className="px-4 py-2 bg-v-gold text-v-charcoal rounded hover:bg-v-gold-dim disabled:opacity-50 font-medium"
              >
                {emailSending ? 'Sending...' : `Send to ${selectedIds.size} Customer${selectedIds.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AppShell>
  );
}
