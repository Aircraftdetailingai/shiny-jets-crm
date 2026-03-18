"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';

// Default column order and visibility
const getDefaultConfig = (tableId) => {
  const defaults = {
    customer: {
      order: ['make', 'model', 'registration', 'company', 'services', 'total', 'status', 'date'],
      visible: ['make', 'model', 'registration', 'company', 'services', 'total', 'status', 'date'],
    },
    detailer: {
      order: ['select', 'customer', 'aircraft', 'registration', 'services', 'total', 'status', 'date', 'actions'],
      visible: ['select', 'customer', 'aircraft', 'registration', 'services', 'total', 'status', 'date', 'actions'],
    },
    vendor: {
      order: ['product', 'customer', 'quantity', 'total', 'commission', 'status', 'date', 'actions'],
      visible: ['product', 'customer', 'quantity', 'total', 'commission', 'status', 'date', 'actions'],
    },
  };
  return defaults[tableId] || { order: [], visible: [] };
};

export default function DataTable({
  tableId = 'default',
  data = [],
  columns = [],
  onRowClick,
  emptyMessage = 'No data available',
  searchable = true,
  stickyFirstColumn = true,
}) {
  const tableRef = useRef(null);
  const [sorting, setSorting] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnVisibility, setColumnVisibility] = useState({});
  const [columnOrder, setColumnOrder] = useState([]);
  const [columnWidths, setColumnWidths] = useState({});
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [draggedColumn, setDraggedColumn] = useState(null);
  const [resizing, setResizing] = useState(null);

  // Load saved preferences
  useEffect(() => {
    const saved = localStorage.getItem(`table_config_${tableId}`);
    if (saved) {
      try {
        const config = JSON.parse(saved);
        if (config.visibility) setColumnVisibility(config.visibility);
        if (config.order) setColumnOrder(config.order);
        if (config.widths) setColumnWidths(config.widths);
      } catch (e) {}
    } else {
      // Use defaults
      const defaults = getDefaultConfig(tableId);
      const visibility = {};
      columns.forEach(col => {
        visibility[col.id || col.accessorKey] = defaults.visible.includes(col.id || col.accessorKey);
      });
      setColumnVisibility(visibility);
      setColumnOrder(defaults.order);
    }
  }, [tableId, columns]);

  // Save preferences
  const savePreferences = useCallback(() => {
    localStorage.setItem(`table_config_${tableId}`, JSON.stringify({
      visibility: columnVisibility,
      order: columnOrder,
      widths: columnWidths,
    }));
  }, [tableId, columnVisibility, columnOrder, columnWidths]);

  useEffect(() => {
    if (Object.keys(columnVisibility).length > 0) {
      savePreferences();
    }
  }, [columnVisibility, columnOrder, columnWidths, savePreferences]);

  // Reset to defaults
  const resetToDefaults = () => {
    const defaults = getDefaultConfig(tableId);
    const visibility = {};
    columns.forEach(col => {
      const id = col.id || col.accessorKey;
      visibility[id] = defaults.visible.length === 0 || defaults.visible.includes(id);
    });
    setColumnVisibility(visibility);
    setColumnOrder(defaults.order.length > 0 ? defaults.order : columns.map(c => c.id || c.accessorKey));
    setColumnWidths({});
    localStorage.removeItem(`table_config_${tableId}`);
  };

  // Toggle column visibility
  const toggleColumn = (columnId) => {
    setColumnVisibility(prev => ({
      ...prev,
      [columnId]: !prev[columnId],
    }));
  };

  // Column drag handlers
  const handleDragStart = (e, columnId) => {
    setDraggedColumn(columnId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, columnId) => {
    e.preventDefault();
    if (draggedColumn && draggedColumn !== columnId) {
      const currentOrder = columnOrder.length > 0
        ? columnOrder
        : columns.map(c => c.id || c.accessorKey);
      const dragIndex = currentOrder.indexOf(draggedColumn);
      const hoverIndex = currentOrder.indexOf(columnId);

      if (dragIndex !== -1 && hoverIndex !== -1) {
        const newOrder = [...currentOrder];
        newOrder.splice(dragIndex, 1);
        newOrder.splice(hoverIndex, 0, draggedColumn);
        setColumnOrder(newOrder);
      }
    }
  };

  const handleDragEnd = () => {
    setDraggedColumn(null);
  };

  // Column resize handlers
  const handleResizeStart = (e, columnId) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({ columnId, startX: e.clientX, startWidth: columnWidths[columnId] || 150 });
  };

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e) => {
      const diff = e.clientX - resizing.startX;
      const newWidth = Math.max(80, resizing.startWidth + diff);
      setColumnWidths(prev => ({
        ...prev,
        [resizing.columnId]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);

  // Ordered columns
  const orderedColumns = useMemo(() => {
    if (columnOrder.length === 0) return columns;

    const ordered = [];
    columnOrder.forEach(id => {
      const col = columns.find(c => (c.id || c.accessorKey) === id);
      if (col) ordered.push(col);
    });

    // Add any columns not in the order
    columns.forEach(col => {
      const id = col.id || col.accessorKey;
      if (!columnOrder.includes(id)) ordered.push(col);
    });

    return ordered;
  }, [columns, columnOrder]);

  const table = useReactTable({
    data,
    columns: orderedColumns,
    state: {
      sorting,
      globalFilter,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Toolbar */}
      <div className="p-4 border-b flex items-center justify-between gap-4 flex-wrap">
        {searchable && (
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search..."
            className="border rounded-lg px-4 py-2 w-64"
          />
        )}

        <div className="flex items-center gap-2 ml-auto">
          {/* Column visibility dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowColumnMenu(!showColumnMenu)}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              Columns
            </button>

            {showColumnMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowColumnMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-64 bg-white border rounded-lg shadow-lg z-20 p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-medium text-sm">Show/Hide Columns</span>
                    <button
                      onClick={resetToDefaults}
                      className="text-xs text-v-gold-dim hover:underline"
                    >
                      Reset to Default
                    </button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {columns.map(col => {
                      const id = col.id || col.accessorKey;
                      const label = typeof col.header === 'string' ? col.header : id;
                      return (
                        <label key={id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={columnVisibility[id] !== false}
                            onChange={() => toggleColumn(id)}
                            className="w-4 h-4 text-v-gold rounded"
                          />
                          <span className="text-sm">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            onClick={resetToDefaults}
            className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm"
          >
            Reset Layout
          </button>
        </div>
      </div>

      {/* Table */}
      <div
        ref={tableRef}
        className="overflow-x-auto"
        style={{ maxHeight: '600px' }}
      >
        <table className="w-full border-collapse min-w-max">
          <thead className="bg-gray-50 sticky top-0 z-10">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header, idx) => {
                  const columnId = header.column.id;
                  const width = columnWidths[columnId] || 'auto';
                  const isSticky = stickyFirstColumn && idx === 0;

                  return (
                    <th
                      key={header.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, columnId)}
                      onDragOver={(e) => handleDragOver(e, columnId)}
                      onDragEnd={handleDragEnd}
                      onClick={header.column.getToggleSortingHandler()}
                      className={`
                        text-left px-4 py-3 text-sm font-medium text-gray-600
                        border-b border-r last:border-r-0 cursor-pointer select-none
                        hover:bg-gray-100 relative group
                        ${isSticky ? 'sticky left-0 bg-gray-50 z-20' : ''}
                        ${draggedColumn === columnId ? 'opacity-50' : ''}
                      `}
                      style={{ width, minWidth: 80 }}
                    >
                      <div className="flex items-center gap-2">
                        <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                        {header.column.getIsSorted() && (
                          <span className="text-v-gold">
                            {header.column.getIsSorted() === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>

                      {/* Resize handle */}
                      <div
                        onMouseDown={(e) => handleResizeStart(e, columnId)}
                        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-v-gold opacity-0 group-hover:opacity-100"
                      />
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={table.getVisibleLeafColumns().length}
                  className="text-center py-12 text-gray-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, rowIdx) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={`
                    row-hover
                    ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                    ${onRowClick ? 'cursor-pointer hover:bg-v-gold/5' : 'hover:bg-gray-100'}
                    border-b
                  `}
                >
                  {row.getVisibleCells().map((cell, idx) => {
                    const columnId = cell.column.id;
                    const width = columnWidths[columnId] || 'auto';
                    const isSticky = stickyFirstColumn && idx === 0;

                    return (
                      <td
                        key={cell.id}
                        className={`
                          px-4 py-3 text-sm border-r last:border-r-0
                          ${isSticky ? `sticky left-0 z-10 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}` : ''}
                        `}
                        style={{ width, minWidth: 80 }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="p-3 border-t bg-gray-50 text-sm text-gray-500">
        Showing {table.getRowModel().rows.length} of {data.length} rows
        {globalFilter && ` (filtered)`}
      </div>
    </div>
  );
}
