/**
 * Table foundation — sortable, filterable, paginated data grid.
 *
 * <DataTable
 *   columns={[{ key:'name', label:'Name', sortable:true }, …]}
 *   data={rows}
 *   loading={isLoading}
 *   emptyType="no-data"
 *   emptyTitle="No records"
 *   onRowClick={(row) => navigate(`/admin/users/${row._id}`)}
 * />
 */

import { useState, useMemo } from 'react';
import Skeleton from './Skeleton';
import EmptyState from './EmptyState';

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

export function DataTable({
  columns = [],
  data = [],
  loading = false,
  loadingRows = 6,
  emptyType = 'no-data',
  emptyTitle = 'No records found',
  emptyDescription = '',
  emptyAction,
  onRowClick,
  selectable = false,
  stickyHeader = false,
  defaultSort,
  rowKey = '_id',
  className = '',
}) {
  const [sortKey, setSortKey]   = useState(defaultSort?.key || '');
  const [sortDir, setSortDir]   = useState(defaultSort?.dir || 'asc');
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [selected, setSelected] = useState(new Set());

  /* ── Sort handler ── */
  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  /* ── Derived data ── */
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(row =>
      columns.some(col => {
        const val = col.accessor ? col.accessor(row) : row[col.key];
        return String(val ?? '').toLowerCase().includes(q);
      })
    );
  }, [data, search, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find(c => c.key === sortKey);
    return [...filtered].sort((a, b) => {
      const av = col?.accessor ? col.accessor(a) : a[sortKey];
      const bv = col?.accessor ? col.accessor(b) : b[sortKey];
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / rowsPerPage));
  const safePage   = Math.min(page, totalPages);
  const pageData   = sorted.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  /* ── Select all ── */
  const allSelected = pageData.length > 0 && pageData.every(r => selected.has(r[rowKey]));
  const toggleAll   = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) pageData.forEach(r => next.delete(r[rowKey]));
      else             pageData.forEach(r => next.add(r[rowKey]));
      return next;
    });
  };
  const toggleRow = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div className={`dt ${className}`}>
      {/* ── Toolbar ── */}
      <div className="dt__toolbar">
        <div className="dt__search-wrap">
          <svg className="dt__search-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd"/>
          </svg>
          <input
            type="search"
            className="dt__search"
            placeholder="Search…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            aria-label="Search records"
          />
        </div>
        {selectable && selected.size > 0 && (
          <span className="dt__selection-count">{selected.size} selected</span>
        )}
      </div>

      {/* ── Table ── */}
      <div className={`dt__wrap ${stickyHeader ? 'dt__wrap--sticky' : ''}`}>
        {loading ? (
          <Skeleton.Table rows={loadingRows} cols={columns.length || 4} />
        ) : pageData.length === 0 ? (
          <EmptyState
            type={search ? 'no-results' : emptyType}
            title={search ? 'No results' : emptyTitle}
            description={search ? `No matches for "${search}"` : emptyDescription}
            action={!search ? emptyAction : { label: 'Clear search', onClick: () => setSearch('') }}
            compact
          />
        ) : (
          <table className="dt__table" role="grid">
            <thead className="dt__head">
              <tr>
                {selectable && (
                  <th className="dt__th dt__th--check">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all rows on this page"
                    />
                  </th>
                )}
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={`dt__th ${col.sortable ? 'dt__th--sortable' : ''} ${col.align ? `dt__th--${col.align}` : ''}`}
                    aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    style={{ width: col.width }}
                  >
                    {col.sortable ? (
                      <button type="button" className="dt__sort-btn" onClick={() => handleSort(col.key)}>
                        {col.label}
                        <SortIcon active={sortKey === col.key} dir={sortDir} />
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="dt__body">
              {pageData.map((row) => {
                const id = row[rowKey];
                return (
                  <tr
                    key={id}
                    className={`dt__row ${onRowClick ? 'dt__row--clickable' : ''} ${selected.has(id) ? 'dt__row--selected' : ''}`}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row) : undefined}
                  >
                    {selectable && (
                      <td className="dt__td dt__td--check" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(id)}
                          onChange={() => toggleRow(id)}
                          aria-label={`Select row ${id}`}
                        />
                      </td>
                    )}
                    {columns.map(col => (
                      <td key={col.key} className={`dt__td ${col.align ? `dt__td--${col.align}` : ''}`}>
                        {col.render ? col.render(row) : (col.accessor ? col.accessor(row) : row[col.key])}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ── */}
      {!loading && sorted.length > 0 && (
        <div className="dt__pagination">
          <div className="dt__pagination-info">
            <label className="dt__rows-label">
              Rows per page:
              <select
                className="dt__rows-select"
                value={rowsPerPage}
                onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
                aria-label="Rows per page"
              >
                {ROWS_PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <span className="dt__pagination-range">
              {(safePage - 1) * rowsPerPage + 1}–{Math.min(safePage * rowsPerPage, sorted.length)} of {sorted.length}
            </span>
          </div>
          <div className="dt__pagination-nav" role="navigation" aria-label="Pagination">
            <button
              type="button" className="dt__page-btn"
              onClick={() => setPage(1)} disabled={safePage === 1}
              aria-label="First page"
            >«</button>
            <button
              type="button" className="dt__page-btn"
              onClick={() => setPage(p => p - 1)} disabled={safePage === 1}
              aria-label="Previous page"
            >‹</button>
            <span className="dt__page-current" aria-current="page">
              {safePage} / {totalPages}
            </span>
            <button
              type="button" className="dt__page-btn"
              onClick={() => setPage(p => p + 1)} disabled={safePage === totalPages}
              aria-label="Next page"
            >›</button>
            <button
              type="button" className="dt__page-btn"
              onClick={() => setPage(totalPages)} disabled={safePage === totalPages}
              aria-label="Last page"
            >»</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SortIcon({ active, dir }) {
  return (
    <svg className={`dt__sort-icon ${active ? 'dt__sort-icon--active' : ''}`} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      {active && dir === 'asc'
        ? <path d="M8 4l4 8H4l4-8z"/>
        : active && dir === 'desc'
          ? <path d="M8 12L4 4h8L8 12z"/>
          : <path d="M8 2l3 5H5l3-5zm0 12l-3-5h6l-3 5z"/>
      }
    </svg>
  );
}

export default DataTable;
