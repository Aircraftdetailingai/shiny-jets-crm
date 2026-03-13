"use client";
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useToast } from '@/components/Toast';
import AddCustomerModal from '@/components/AddCustomerModal';

const TAG_COLORS = {
  'VIP': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'Recurring': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'Corporate': 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  'FBO': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'Owner-Pilot': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  'Fleet': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'Referral': 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  'High-Value': 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  'Prospect': 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  'Inactive': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  'Charter': 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  'Private': 'bg-violet-500/20 text-violet-300 border-violet-500/30',
};

function getTagStyle(tagName) {
  return TAG_COLORS[tagName] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
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

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchData();
  }, [router]);

  const fetchData = async () => {
    const token = localStorage.getItem('vector_token');
    try {
      const [custRes, tagsRes] = await Promise.all([
        fetch('/api/customers?limit=500', { headers: { Authorization: `Bearer ${token}` } }),
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
        fetchData();
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
      // Handle nulls
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      // Numeric fields
      if (sortField === 'quote_count' || sortField === 'total_revenue') {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      // Date fields
      if (sortField === 'created_at' || sortField === 'last_service_date') {
        return sortDir === 'asc'
          ? new Date(aVal) - new Date(bVal)
          : new Date(bVal) - new Date(aVal);
      }
      // String fields
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

  // Delete single customer
  const deleteCustomer = async (customer) => {
    if (!confirm(`Delete ${customer.name || customer.email}? This cannot be undone.`)) return;
    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setCustomers(prev => prev.filter(c => c.id !== customer.id));
        setSelectedIds(prev => { const next = new Set(prev); next.delete(customer.id); return next; });
        toastSuccess('Customer deleted');
      } else {
        const data = await res.json();
        toastError(data.error || 'Failed to delete');
      }
    } catch (err) {
      toastError('Failed to delete customer');
    }
  };

  // Bulk delete selected
  const bulkDelete = async () => {
    const count = selectedIds.size;
    if (!confirm(`Delete ${count} customer${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
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

  if (loading) {
    return <LoadingSpinner message="Loading..." />;
  }

  return (
    <div className="page-transition min-h-screen bg-v-charcoal p-4">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div className="flex items-center space-x-4">
          <a href="/dashboard" className="text-2xl text-v-text-secondary hover:text-v-gold">&#8592;</a>
          <div>
            <h1 className="text-2xl font-light tracking-wide text-v-text-primary">Customers</h1>
            <p className="text-sm text-v-text-secondary">{customers.length} total</p>
          </div>
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
            className="px-4 py-2 bg-v-gold text-v-charcoal rounded hover:bg-v-gold-dim text-sm font-medium"
          >
            + Add Customer
          </button>
          <button
            onClick={() => setShowTagManager(!showTagManager)}
            className="px-3 py-2 border border-v-border text-v-text-secondary rounded hover:text-v-text-primary hover:border-v-gold/50 text-sm"
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
            className="bg-v-surface border border-v-border rounded px-4 py-2 text-v-text-primary text-sm outline-none focus:border-v-gold/50"
          >
            <option value="">All Customers</option>
            {usedTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="bg-v-surface border border-v-gold/30 rounded px-4 py-3 mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-v-text-primary mr-2">
                {selectedIds.size} selected
              </span>
              <button
                onClick={() => { setBulkTagModal(true); setBulkTagAction('add'); setBulkTagSelection([]); }}
                className="px-3 py-1.5 bg-v-gold/20 text-v-gold text-xs rounded hover:bg-v-gold/30 font-medium border border-v-gold/30"
              >
                Assign Tag
              </button>
              <button
                onClick={moveToVip}
                className="px-3 py-1.5 bg-amber-500/20 text-amber-300 text-xs rounded hover:bg-amber-500/30 font-medium border border-amber-500/30"
              >
                &#9733; Move to VIP
              </button>
              <button
                onClick={exportCsv}
                className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 text-xs rounded hover:bg-emerald-500/30 font-medium border border-emerald-500/30"
              >
                Export CSV
              </button>
              <button
                onClick={() => { setEmailBlastModal(true); setEmailSubject(''); setEmailMessage(''); }}
                className="px-3 py-1.5 bg-blue-500/20 text-blue-300 text-xs rounded hover:bg-blue-500/30 font-medium border border-blue-500/30"
              >
                Email Blast
              </button>
              <button
                onClick={bulkDelete}
                disabled={bulkDeleting}
                className="px-3 py-1.5 bg-red-500/20 text-red-400 text-xs rounded hover:bg-red-500/30 font-medium border border-red-500/30 disabled:opacity-50"
              >
                {bulkDeleting ? 'Deleting...' : 'Delete Selected'}
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-v-text-secondary hover:text-v-text-primary">
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Customer List */}
        <div className="bg-v-surface border border-v-border rounded overflow-hidden">
          {/* Table Header */}
          <div className="bg-v-navy border-b border-v-border px-4 py-3 hidden sm:grid sm:grid-cols-14 gap-4 items-center text-xs font-medium text-v-text-secondary uppercase tracking-wider">
            <div className="col-span-1">
              <input
                type="checkbox"
                checked={filteredCustomers.length > 0 && selectedIds.size === filteredCustomers.length}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-v-border text-v-gold cursor-pointer accent-amber-500"
              />
            </div>
            <div className="col-span-3 cursor-pointer select-none hover:text-v-text-primary" onClick={() => handleSort('name')}>
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
              Last Activity <SortArrow field="last_service_date" />
            </div>
            <div className="col-span-1"></div>
          </div>

          {filteredCustomers.length === 0 ? (
            customers.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-5xl mb-4 opacity-30">&#128100;</div>
                <h3 className="text-xl font-light tracking-wide text-v-text-primary mb-2">No customers yet</h3>
                <p className="text-v-text-secondary mb-6 max-w-sm mx-auto">Add your first customer to start tracking quotes, services, and building relationships.</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-6 py-3 bg-v-gold text-v-charcoal rounded font-medium hover:bg-v-gold-dim"
                >
                  + Add Your First Customer
                </button>
              </div>
            ) : (
              <div className="p-8 text-center text-v-text-secondary">No results found</div>
            )
          ) : (
            <div className="divide-y divide-v-border/50">
              {filteredCustomers.map((customer) => {
                const tags = Array.isArray(customer.tags) ? customer.tags : [];
                return (
                  <div key={customer.id || customer.email} className="px-4 py-3 hover:bg-v-surface-light grid grid-cols-1 sm:grid-cols-14 gap-2 sm:gap-4 items-center transition-colors">
                    {/* Checkbox */}
                    <div className="col-span-1 hidden sm:block">
                      {customer.id && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(customer.id)}
                          onChange={() => toggleSelect(customer.id)}
                          className="w-4 h-4 rounded border-v-border accent-amber-500 cursor-pointer"
                        />
                      )}
                    </div>

                    {/* Customer Info */}
                    <div className="col-span-3 cursor-pointer" onClick={() => customer.id && router.push(`/customers/${customer.id}`)}>
                      <p className="font-medium text-v-text-primary hover:text-v-gold">{customer.name || 'Name'}</p>
                      <p className="text-xs text-v-text-secondary">{customer.email}</p>
                      {customer.company_name && (
                        <p className="text-xs text-v-text-secondary/60">{customer.company_name}</p>
                      )}
                    </div>

                    {/* Tags */}
                    <div className="col-span-3">
                      <div className="flex flex-wrap gap-1">
                        {tags.map((tag) => (
                          <span key={tag} className={`px-2 py-0.5 rounded text-xs font-medium border ${getTagStyle(tag)}`}>
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

                    {/* Actions */}
                    <div className="col-span-1 flex items-center justify-end gap-2">
                      {customer.id && (
                        <button
                          onClick={() => router.push(`/customers/${customer.id}`)}
                          className="hidden sm:inline-flex text-xs text-v-gold hover:text-v-gold-dim font-medium"
                        >
                          View
                        </button>
                      )}
                      {customer.id && (
                        <button
                          onClick={() => deleteCustomer(customer)}
                          className="hidden sm:inline-flex text-xs text-red-400/60 hover:text-red-400"
                          title="Delete customer"
                        >
                          &#10005;
                        </button>
                      )}
                      {customer.id && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(customer.id)}
                          onChange={() => toggleSelect(customer.id)}
                          className="w-4 h-4 rounded border-v-border accent-amber-500 sm:hidden"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className="p-3 border-t border-v-border bg-v-navy text-sm text-v-text-secondary flex justify-between items-center">
            <span>Showing {filteredCustomers.length} of {customers.length} customers</span>
            {selectedIds.size === 0 && filteredCustomers.length > 0 && (
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
          <div className="bg-v-surface border border-v-border rounded p-6 w-full max-w-md">
            <h3 className="text-lg font-light tracking-wide text-v-text-primary mb-1">Edit Tags</h3>
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
          <div className="bg-v-surface border border-v-border rounded p-6 w-full max-w-md">
            <h3 className="text-lg font-light tracking-wide text-v-text-primary mb-1">Manage Tags</h3>
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
          <div className="bg-v-surface border border-v-border rounded-t-lg sm:rounded p-5 sm:p-6 w-full sm:max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-light tracking-wide text-v-text-primary">Send Email Blast</h3>
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
  );
}
