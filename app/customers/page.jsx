"use client";
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useToast } from '@/components/Toast';
import AddCustomerModal from '@/components/AddCustomerModal';

const TAG_COLORS = {
  'VIP': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'Recurring': 'bg-blue-100 text-blue-800 border-blue-300',
  'Corporate': 'bg-indigo-100 text-indigo-800 border-indigo-300',
  'FBO': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'Owner-Pilot': 'bg-orange-100 text-orange-800 border-orange-300',
  'Fleet': 'bg-purple-100 text-purple-800 border-purple-300',
  'Referral': 'bg-pink-100 text-pink-800 border-pink-300',
  'High-Value': 'bg-teal-100 text-teal-800 border-teal-300',
};

function getTagStyle(tagName) {
  return TAG_COLORS[tagName] || 'bg-gray-100 text-gray-700 border-gray-300';
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
    return result;
  }, [customers, search, filterTag]);

  // Unique tags across all customers
  const usedTags = useMemo(() => {
    const tagSet = new Set();
    customers.forEach(c => {
      if (Array.isArray(c.tags)) c.tags.forEach(t => tagSet.add(t));
    });
    // Also include all known tags
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
        // Update local state
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

  if (loading) {
    return <LoadingSpinner message={'Loading...'} />;
  }

  return (
    <div className="page-transition min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 text-white">
        <div className="flex items-center space-x-4">
          <a href="/dashboard" className="text-2xl hover:text-amber-400">&#8592;</a>
          <div>
            <h1 className="text-2xl font-bold">{'Customers'}</h1>
            <p className="text-sm text-white/60">{customers.length} {'Total'.toLowerCase()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {qbConnected && (
            <button
              onClick={handleQBImport}
              disabled={qbImporting}
              className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-semibold"
            >
              {qbImporting ? 'Importing...' : 'Import from QB'}
            </button>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg hover:opacity-90 text-sm font-semibold shadow-md"
          >
            + Add Customer
          </button>
          <button
            onClick={() => setShowTagManager(!showTagManager)}
            className="px-3 py-2 bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/20 text-sm"
          >
            {'Manage Tags'}
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto">
        {/* Tag Manager Panel */}
        {showTagManager && (
          <div className="bg-white rounded-lg shadow p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{'Manage Tags'}</h2>
              <button onClick={() => setShowTagManager(false)} className="text-gray-400 hover:text-gray-600">&times;</button>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {allTags.map((tag) => (
                <span key={tag.id || tag.name} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium border ${getTagStyle(tag.name)}`}>
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
                placeholder={'Tag name'}
                className="border rounded-lg px-3 py-2 text-sm flex-1"
              />
              <input
                type="color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                className="w-10 h-10 border rounded cursor-pointer"
              />
              <button
                onClick={createTag}
                disabled={creatingTag || !newTagName.trim()}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm font-medium"
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
            placeholder={'Search customers...'}
            className="flex-1 border rounded-lg px-4 py-2 bg-white shadow-sm"
          />
          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            className="border rounded-lg px-4 py-2 bg-white shadow-sm text-sm"
          >
            <option value="">{'All Customers'}</option>
            {usedTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="bg-white border border-amber-300 rounded-lg px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-900">
                {selectedIds.size} {'selected'}
              </span>
              <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-500 hover:text-gray-700 underline">
                {'Close'}
              </button>
            </div>
            <button
              onClick={() => {
                setBulkTagModal(true);
                setBulkTagAction('add');
                setBulkTagSelection([]);
              }}
              className="px-3 py-1.5 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600"
            >
              {'Manage Tags'}
            </button>
          </div>
        )}

        {/* Customer List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {/* Table Header */}
          <div className="bg-gray-50 border-b px-4 py-3 hidden sm:grid sm:grid-cols-12 gap-4 items-center text-sm font-medium text-gray-600">
            <div className="col-span-1">
              <input
                type="checkbox"
                checked={filteredCustomers.length > 0 && selectedIds.size === filteredCustomers.length}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-gray-300 text-amber-500 cursor-pointer"
              />
            </div>
            <div className="col-span-3">{'Customer'}</div>
            <div className="col-span-3">{'Tags'}</div>
            <div className="col-span-2">{'Quotes'}</div>
            <div className="col-span-2">{'Last Quote'}</div>
            <div className="col-span-1"></div>
          </div>

          {filteredCustomers.length === 0 ? (
            customers.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-5xl mb-4">&#128100;</div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">No customers yet</h3>
                <p className="text-gray-500 mb-6 max-w-sm mx-auto">Add your first customer to start tracking quotes, services, and building relationships.</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg font-semibold shadow-md hover:opacity-90"
                  >
                    + Add Your First Customer
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                {'No results found'}
              </div>
            )
          ) : (
            <div className="divide-y">
              {filteredCustomers.map((customer) => {
                const tags = Array.isArray(customer.tags) ? customer.tags : [];
                return (
                  <div key={customer.id || customer.email} className="px-4 py-3 hover:bg-gray-50 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 items-center">
                    {/* Checkbox */}
                    <div className="col-span-1 hidden sm:block">
                      {customer.id && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(customer.id)}
                          onChange={() => toggleSelect(customer.id)}
                          className="w-4 h-4 rounded border-gray-300 text-amber-500 cursor-pointer"
                        />
                      )}
                    </div>

                    {/* Customer Info */}
                    <div className="col-span-3 cursor-pointer" onClick={() => customer.id && router.push(`/customers/${customer.id}`)}>
                      <p className="font-medium text-gray-900 hover:text-amber-600">{customer.name || 'Name'}</p>
                      <p className="text-xs text-gray-500">{customer.email}</p>
                      {customer.company_name && (
                        <p className="text-xs text-gray-400">{customer.company_name}</p>
                      )}
                    </div>

                    {/* Tags */}
                    <div className="col-span-3">
                      <div className="flex flex-wrap gap-1">
                        {tags.map((tag) => (
                          <span key={tag} className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getTagStyle(tag)}`}>
                            {tag}
                          </span>
                        ))}
                        {customer.id && (
                          <button
                            onClick={() => {
                              setEditCustomer(customer);
                              setEditTags([...tags]);
                            }}
                            className="px-2 py-0.5 rounded-full text-xs text-gray-400 border border-dashed border-gray-300 hover:border-amber-400 hover:text-amber-600"
                          >
                            + {'Tags'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Quotes */}
                    <div className="col-span-2 text-sm text-gray-600">
                      {`${customer.quote_count || 0} {count, plural, one ${quote} other ${quotes}}`}
                    </div>

                    {/* Last Service */}
                    <div className="col-span-2 text-sm text-gray-500">
                      {formatDate(customer.last_service_date)}
                    </div>

                    {/* View / Mobile checkbox */}
                    <div className="col-span-1 flex items-center justify-end">
                      {customer.id && (
                        <button
                          onClick={() => router.push(`/customers/${customer.id}`)}
                          className="hidden sm:inline-flex text-xs text-amber-600 hover:text-amber-700 font-medium"
                        >
                          {'View'}
                        </button>
                      )}
                      {customer.id && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(customer.id)}
                          onChange={() => toggleSelect(customer.id)}
                          className="w-4 h-4 rounded border-gray-300 text-amber-500 sm:hidden"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className="p-3 border-t bg-gray-50 text-sm text-gray-500">
            {'Showing'} {filteredCustomers.length} {'of'} {customers.length} {'Customers'.toLowerCase()}
          </div>
        </div>
      </div>

      {/* Edit Tags Modal (single customer) */}
      {editCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{'Edit Customer'}</h3>
            <p className="text-sm text-gray-500 mb-4">{editCustomer.name} &mdash; {editCustomer.email}</p>

            {/* Current tags */}
            <div className="flex flex-wrap gap-2 mb-4 min-h-[32px]">
              {editTags.length === 0 && (
                <span className="text-sm text-gray-400">{'None'}</span>
              )}
              {editTags.map((tag) => (
                <span key={tag} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium border ${getTagStyle(tag)}`}>
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

            {/* Available tags to add */}
            <p className="text-xs font-medium text-gray-500 mb-2">{'Tags'}</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {usedTags.filter(t => !editTags.includes(t)).map((tag) => (
                <button
                  key={tag}
                  onClick={() => setEditTags(prev => [...prev, tag])}
                  className={`px-2.5 py-1 rounded-full text-sm font-medium border cursor-pointer hover:opacity-80 ${getTagStyle(tag)}`}
                >
                  + {tag}
                </button>
              ))}
              {usedTags.filter(t => !editTags.includes(t)).length === 0 && (
                <span className="text-sm text-gray-400">{'None'}</span>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setEditCustomer(null)}
                className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
              >
                {'Cancel'}
              </button>
              <button
                onClick={() => saveCustomerTags(editCustomer.id, editTags)}
                disabled={editSaving}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
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
            setCustomers(prev => [{ ...data.customer, quote_count: 0, last_service_date: null }, ...prev]);
          }
          toastSuccess(data?.created ? 'Customer added!' : 'Customer saved!');
        }}
      />

      {bulkTagModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{'Manage Tags'}</h3>
            <p className="text-sm text-gray-500 mb-4">{selectedIds.size} {'Customer'.toLowerCase()}{selectedIds.size !== 1 ? 's' : ''} {'selected'}</p>

            {/* Action toggle */}
            <div className="flex gap-2 mb-4">
              {[
                { value: 'add', label: 'Add Tags' },
                { value: 'remove', label: 'Remove Tags' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setBulkTagAction(opt.value)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border ${
                    bulkTagAction === opt.value
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Tag selection */}
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
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      selected
                        ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
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
                className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
              >
                {'Cancel'}
              </button>
              <button
                onClick={executeBulkTag}
                disabled={bulkProcessing || bulkTagSelection.length === 0}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
              >
                {bulkProcessing ? 'Processing...' : `${bulkTagAction === 'add' ? 'Add' : 'Remove'} ${'Tags'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
