/**
 * DataTable — enterprise-grade data table built on @tanstack/react-table v8.
 *
 * Features:
 *   - Column sorting (click header, shift+click multi-sort)
 *   - Global text search
 *   - Column visibility toggle
 *   - Row selection with bulk actions
 *   - Pagination (configurable page sizes)
 *   - CSV export
 *   - Loading skeleton
 *   - Empty state
 *   - Sticky header
 *   - Responsive horizontal scroll
 *   - Full keyboard navigation
 *   - ARIA labels throughout
 */

import { useState, useMemo, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import {
  ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Search, Download, Columns, X, Check,
} from 'lucide-react';

/* ── CSV export helper ──────────────────────────────────────────── */
function exportToCsv(table, filename = 'export.csv') {
  const headers = table.getLeafHeaders()
    .filter((h) => h.id !== 'select')
    .map((h) => h.column.columnDef.header ?? h.id);

  const rows = table.getFilteredRowModel().rows.map((row) =>
    row.getVisibleCells()
      .filter((c) => c.column.id !== 'select')
      .map((c) => {
        const val = c.getValue();
        if (val == null) return '';
        const str = String(val).replace(/"/g, '""');
        return str.includes(',') || str.includes('\n') ? `"${str}"` : str;
      })
  );

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Sort icon ──────────────────────────────────────────────────── */
function SortIcon({ sorted }) {
  if (sorted === 'asc')  return <ChevronUp   size={12} aria-hidden="true" />;
  if (sorted === 'desc') return <ChevronDown  size={12} aria-hidden="true" />;
  return <ChevronsUpDown size={12} style={{ opacity: 0.35 }} aria-hidden="true" />;
}

/* ════════════════════════════════════════════════════════════════
   DataTable
   ════════════════════════════════════════════════════════════════ */
export default function DataTable({
  columns,
  data = [],
  loading = false,
  emptyMessage = 'No records found',
  emptyIcon = null,
  filename = 'export.csv',
  pageSize: initialPageSize = 10,
  enableSelection = false,
  bulkActions = [],            // [{ label, icon: Icon, onClick(selectedRows) }]
  toolbar,                     // extra JSX rendered in the toolbar
  caption,                     // <caption> for accessibility
  stickyHeader = true,
}) {
  const [sorting,         setSorting]         = useState([]);
  const [globalFilter,    setGlobalFilter]    = useState('');
  const [columnVisibility,setColumnVisibility]= useState({});
  const [rowSelection,    setRowSelection]    = useState({});
  const [colMenuOpen,     setColMenuOpen]     = useState(false);

  /* Prepend selection checkbox column if enabled */
  const allColumns = useMemo(() => {
    if (!enableSelection) return columns;
    return [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllPageRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomePageRowsSelected();
            }}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            aria-label="Select all rows"
            style={{ cursor: 'pointer' }}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            aria-label={`Select row ${row.index + 1}`}
            style={{ cursor: 'pointer' }}
          />
        ),
        size: 40,
        enableSorting: false,
        enableGlobalFilter: false,
      },
      ...columns,
    ];
  }, [columns, enableSelection]);

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, globalFilter, columnVisibility, rowSelection },
    enableRowSelection: enableSelection,
    onSortingChange:         setSorting,
    onGlobalFilterChange:    setGlobalFilter,
    onColumnVisibilityChange:setColumnVisibility,
    onRowSelectionChange:    setRowSelection,
    getCoreRowModel:         getCoreRowModel(),
    getSortedRowModel:       getSortedRowModel(),
    getFilteredRowModel:     getFilteredRowModel(),
    getPaginationRowModel:   getPaginationRowModel(),
    initialState: { pagination: { pageSize: initialPageSize } },
  });

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);

  const handleExport = useCallback(() => exportToCsv(table, filename), [table, filename]);

  /* ── Skeleton rows ────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="ds-table-wrap" role="status" aria-label="Loading table data">
        <table className="ds-table" aria-busy="true">
          <thead>
            <tr>
              {columns.slice(0, 5).map((_, i) => (
                <th key={i}>
                  <div className="ds-skel" style={{ height: 12, width: `${60 + (i * 20) % 40}px`, borderRadius: 4 }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: initialPageSize > 5 ? 5 : initialPageSize }).map((_, ri) => (
              <tr key={ri}>
                {columns.slice(0, 5).map((_, ci) => (
                  <td key={ci}>
                    <div className="ds-skel" style={{ height: 14, width: `${50 + (ci * 25) % 50}px`, borderRadius: 4 }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const { pageIndex, pageSize } = table.getState().pagination;
  const totalRows = table.getFilteredRowModel().rows.length;
  const startRow = pageIndex * pageSize + 1;
  const endRow   = Math.min((pageIndex + 1) * pageSize, totalRows);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Global search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search
            size={14}
            aria-hidden="true"
            style={{
              position: 'absolute', left: 9, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--text-secondary)',
              pointerEvents: 'none',
            }}
          />
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search…"
            aria-label="Search table"
            style={{
              width: '100%', padding: '7px 30px 7px 32px',
              border: '1px solid var(--border-default)', borderRadius: 8,
              background: 'var(--bg-page)', color: 'var(--text-primary)',
              fontSize: '0.82rem', fontFamily: 'var(--font-sans)',
              outline: 'none', transition: 'border-color var(--duration-base)',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--border-brand)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
          />
          {globalFilter && (
            <button
              onClick={() => setGlobalFilter('')}
              aria-label="Clear search"
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                border: 'none', background: 'none', cursor: 'pointer', padding: 2,
                color: 'var(--text-secondary)', display: 'flex',
              }}
            >
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Extra toolbar slot */}
        {toolbar}

        {/* Bulk actions */}
        {enableSelection && selectedRows.length > 0 && bulkActions.map((action, i) => (
          <button
            key={i}
            onClick={() => { action.onClick(selectedRows); setRowSelection({}); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border-default)',
              background: 'var(--bg-surface)', color: 'var(--text-primary)',
              fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {action.icon && <action.icon size={13} aria-hidden="true" />}
            {action.label} ({selectedRows.length})
          </button>
        ))}

        {/* Column visibility toggle */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setColMenuOpen((o) => !o)}
            aria-label="Toggle column visibility"
            aria-expanded={colMenuOpen}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border-default)',
              background: 'var(--bg-surface)', color: 'var(--text-secondary)',
              fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <Columns size={13} aria-hidden="true" /> Columns
          </button>
          {colMenuOpen && (
            <div
              style={{
                position: 'absolute', top: 'calc(100% + 4px)', right: 0,
                background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                borderRadius: 10, boxShadow: 'var(--shadow-md)', padding: '8px',
                zIndex: 'var(--z-dropdown)', minWidth: 160,
              }}
              role="group"
              aria-label="Column visibility"
            >
              {table.getAllLeafColumns()
                .filter((col) => col.id !== 'select')
                .map((col) => (
                  <label
                    key={col.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                      fontSize: '0.8rem', color: 'var(--text-primary)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={col.getIsVisible()}
                      onChange={col.getToggleVisibilityHandler()}
                    />
                    {String(col.columnDef.header ?? col.id)}
                  </label>
                ))
              }
            </div>
          )}
        </div>

        {/* CSV export */}
        <button
          onClick={handleExport}
          aria-label="Export to CSV"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border-default)',
            background: 'var(--bg-surface)', color: 'var(--text-secondary)',
            fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <Download size={13} aria-hidden="true" /> Export
        </button>
      </div>

      {/* ── Table ───────────────────────────────────────────────── */}
      <div className="ds-table-wrap" style={{ maxHeight: stickyHeader ? 520 : undefined, overflowY: stickyHeader ? 'auto' : undefined }}>
        <table
          className="ds-table"
          aria-rowcount={totalRows}
          aria-colcount={table.getVisibleLeafColumns().length}
        >
          {caption && <caption style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{caption}</caption>}
          <thead style={stickyHeader ? { position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-page)' } : {}}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    style={{
                      width: header.column.columnDef.size,
                      cursor: header.column.getCanSort() ? 'pointer' : 'default',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                    }}
                    onClick={header.column.getToggleSortingHandler()}
                    aria-sort={
                      header.column.getIsSorted() === 'asc'  ? 'ascending'
                      : header.column.getIsSorted() === 'desc' ? 'descending'
                      : header.column.getCanSort() ? 'none' : undefined
                    }
                  >
                    {header.isPlaceholder ? null : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <SortIcon sorted={header.column.getIsSorted()} />
                        )}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} style={{ textAlign: 'center' }}>
                  <div className="ds-empty" style={{ padding: '32px 20px' }}>
                    {emptyIcon && (
                      <div className="ds-empty__icon">{emptyIcon}</div>
                    )}
                    <div className="ds-empty__title">{emptyMessage}</div>
                    {globalFilter && (
                      <button
                        onClick={() => setGlobalFilter('')}
                        style={{ marginTop: 10, color: 'var(--text-brand)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'var(--font-sans)' }}
                      >
                        Clear search
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  aria-selected={enableSelection ? row.getIsSelected() : undefined}
                  style={row.getIsSelected() ? { background: 'var(--color-primary-surface)' } : {}}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ──────────────────────────────────────────── */}
      {totalRows > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 8,
        }}>
          {/* Row info */}
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {totalRows === 0
              ? 'No results'
              : `${startRow}–${endRow} of ${totalRows} row${totalRows !== 1 ? 's' : ''}`
            }
            {enableSelection && selectedRows.length > 0 && (
              <span> · {selectedRows.length} selected</span>
            )}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Page size */}
            <select
              value={pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              aria-label="Rows per page"
              style={{
                padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)', color: 'var(--text-primary)',
                fontSize: '0.78rem', fontFamily: 'var(--font-sans)', cursor: 'pointer',
              }}
            >
              {[5, 10, 20, 50, 100].map((s) => (
                <option key={s} value={s}>{s} / page</option>
              ))}
            </select>

            {/* Navigation buttons */}
            {[
              { Icon: ChevronsLeft,  label: 'First page',    fn: () => table.setPageIndex(0),            disabled: !table.getCanPreviousPage() },
              { Icon: ChevronLeft,   label: 'Previous page', fn: () => table.previousPage(),              disabled: !table.getCanPreviousPage() },
              { Icon: ChevronRight,  label: 'Next page',     fn: () => table.nextPage(),                  disabled: !table.getCanNextPage() },
              { Icon: ChevronsRight, label: 'Last page',     fn: () => table.setPageIndex(table.getPageCount() - 1), disabled: !table.getCanNextPage() },
            ].map(({ Icon, label, fn, disabled }) => (
              <button
                key={label}
                onClick={fn}
                disabled={disabled}
                aria-label={label}
                style={{
                  width: 30, height: 30, border: '1px solid var(--border-default)',
                  borderRadius: 6, background: 'var(--bg-surface)', cursor: disabled ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: disabled ? 'var(--text-disabled)' : 'var(--text-primary)',
                  opacity: disabled ? 0.5 : 1, transition: 'var(--transition-base)',
                }}
              >
                <Icon size={14} aria-hidden="true" />
              </button>
            ))}

            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              Page {pageIndex + 1} / {Math.max(1, table.getPageCount())}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
