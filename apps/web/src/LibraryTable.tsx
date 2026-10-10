import { useId, useRef, useState } from "react";
import type { FocusEvent, PointerEvent, ReactNode, Ref } from "react";
import type { Piece } from "./library-window";
import Icon from "./ui/Icon";
import { columnNames, columnWidth, defaultWidths, moveColumn } from "./library-table";
import type { Column, SortColumn } from "./library-table";
export type LibraryRow = { key: string; type: "song" | "album" | "artist"; title: string; artist?: string; album_artist?: string; album?: string; year?: number; count: number; duration_s?: number; genres: string[]; album_key?: string };

/** Only the rows near the screen are drawn (see useLibraryWindow); `pieces` says which, with gaps for the rest. */
type Props = { pieces: Piece[]; rowAt: (index: number) => LibraryRow | undefined; total: number;
  body: { containerRef: Ref<HTMLElement | null>; onFocus: (event: FocusEvent) => void; onBlur: (event: FocusEvent) => void; expected: (index: number) => number };
  columns: Column[]; order: Column[]; widths: Record<Column, number>; sort: string; direction: string;
  setColumns: (columns: Column[]) => void; setOrder: (order: Column[]) => void; setWidths: (widths: Record<Column, number>) => void;
  onSort: (column: SortColumn) => void; cell: (row: LibraryRow, column: Exclude<Column, "actions">) => ReactNode; actions: (row: LibraryRow) => ReactNode;
  /** The title cell's content (an album's open/close button, an artist link). */
  titleCell: (row: LibraryRow) => ReactNode;
  /** Shown in a full-width row underneath (an open album's songs), or null. */
  detail: (row: LibraryRow) => ReactNode;
  /** Right-click menu and keyboard shortcuts for a row. */
  rowEvents: (row: LibraryRow) => Record<string, unknown> };

function PixelWidth({ column, width, change }: { column: Column; width: number; change: (width: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <label className="browse__column-width"><span className="visually-hidden">{columnNames[column]} width in pixels</span><input className="input" type="number" min="80" max="800" step="10" value={draft ?? width}
    onFocus={() => setDraft(String(width))} onChange={event => setDraft(event.currentTarget.value)}
    onBlur={() => { if (draft?.trim()) change(Number(draft)); setDraft(null); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /><span aria-hidden="true">px</span></label>;
}

export default function LibraryTable({ pieces, rowAt, total, body, columns, order, widths, sort, direction, setColumns, setOrder, setWidths, onSort, cell, actions, titleCell, detail, rowEvents }: Props) {
  const settings = useRef<HTMLDialogElement>(null);
  const settingsId = useId();
  const resize = useRef<{ pointer: number; column: Column; start: number; width: number } | null>(null);
  const dragged = useRef<Column | null>(null);
  const [dropTarget, setDropTarget] = useState<Column | null>(null);
  const visible = order.filter(column => columns.includes(column));
  const changeWidth = (column: Column, value: number) => setWidths({ ...widths, [column]: columnWidth(value, widths[column]) });
  function startResize(event: PointerEvent<HTMLSpanElement>, column: Column) {
    if (event.button !== 0) return;
    event.preventDefault();
    resize.current = { pointer: event.pointerId, column, start: event.clientX, width: widths[column] };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveResize(event: PointerEvent<HTMLSpanElement>) {
    const active = resize.current;
    if (active?.pointer === event.pointerId) changeWidth(active.column, active.width + event.clientX - active.start);
  }
  function endResize(event: PointerEvent<HTMLSpanElement>) {
    if (resize.current?.pointer !== event.pointerId) return;
    resize.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function nudge(column: Column, delta: number) {
    const index = order.indexOf(column), target = order[index + delta];
    if (target) setOrder(moveColumn(order, column, target));
  }
  return <>
    <div className="browse__table-tools"><span className="muted">Click a heading to sort. Drag ⋮⋮ to reorder; drag its right edge to resize.</span>
      <button className="btn btn--ghost btn--sm" aria-haspopup="dialog" aria-controls={settingsId} onClick={() => settings.current?.showModal()}><Icon name="settings" size={16} />Columns</button>
    </div>
    <dialog ref={settings} id={settingsId} className="browse__column-dialog" aria-labelledby={`${settingsId}-title`} onClick={event => { if (event.target === event.currentTarget) settings.current?.close(); }}>
      <div className="browse__column-head"><h3 id={`${settingsId}-title`}>Table columns</h3><button className="btn btn--quiet btn--sm" aria-label="Close column settings" onClick={() => settings.current?.close()}><Icon name="close" /></button></div>
      <p className="muted">Choose columns, change their order and set widths in pixels. Title and actions stay visible.</p>
      <ol className="browse__column-options">{order.map((column, index) => <li key={column}>
        <label><input type="checkbox" checked={columns.includes(column)} disabled={column === "title" || column === "actions"} onChange={event => setColumns(event.target.checked ? [...columns, column] : columns.filter(value => value !== column))} />{columnNames[column]}</label>
        <div className="browse__column-order"><button className="btn btn--quiet btn--sm" disabled={index === 0} aria-label={`Move ${columnNames[column]} earlier`} onClick={() => nudge(column, -1)}>↑</button><button className="btn btn--quiet btn--sm" disabled={index === order.length - 1} aria-label={`Move ${columnNames[column]} later`} onClick={() => nudge(column, 1)}>↓</button></div>
        <PixelWidth column={column} width={widths[column]} change={value => changeWidth(column, value)} />
      </li>)}</ol>
      <div className="browse__column-footer"><button className="btn btn--quiet btn--sm" onClick={() => { setOrder(Object.keys(columnNames) as Column[]); setWidths({ ...defaultWidths }); }}>Reset order and widths</button><button className="btn btn--primary btn--sm" onClick={() => settings.current?.close()}>Done</button></div>
    </dialog>
    <div className="browse__table-wrap" tabIndex={0} role="region" aria-label="Library table, scroll horizontally for more columns"><table ref={body.containerRef as Ref<HTMLTableElement>} onFocus={body.onFocus} onBlur={body.onBlur} className="table browse__table" aria-rowcount={total + 1} style={{ width: visible.reduce((sum, column) => sum + widths[column], 0) }}><caption className="visually-hidden">Library results. Sort headings with Enter. Column move handles support left and right arrow keys; resize handles also support arrow keys.</caption>
      <colgroup>{visible.map(column => <col key={column} style={{ width: widths[column] }} />)}</colgroup>
      <thead><tr aria-rowindex={1}>{visible.map(column => <th key={column} scope="col" data-column={column} className={dropTarget === column ? "is-drop-target" : ""} aria-sort={column === "actions" ? undefined : sort === column ? direction === "asc" ? "ascending" : "descending" : "none"}
        onDragOver={event => { if (dragged.current) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(column); } }}
        onDragLeave={() => setDropTarget(null)} onDrop={event => { event.preventDefault(); const source = dragged.current; if (source) setOrder(moveColumn(order, source, column)); dragged.current = null; setDropTarget(null); }}>
        <div className="browse__column-heading"><button className="browse__column-grip" draggable aria-label={`Move ${columnNames[column]} column`} title="Drag to reorder, or use left/right arrow keys"
          onDragStart={event => { dragged.current = column; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", column); }} onDragEnd={() => { dragged.current = null; setDropTarget(null); }}
          onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); const target = visible[visible.indexOf(column) + (event.key === "ArrowLeft" ? -1 : 1)]; if (target) setOrder(moveColumn(order, column, target)); } }}>⋮⋮</button>
          {column === "actions" ? <span className="browse__column-name">Actions</span> : <button className="browse__column-sort" onClick={() => onSort(column)} title={`Sort by ${columnNames[column]} ${sort === column && direction === "asc" ? "descending" : "ascending"}`}>{columnNames[column]}<span aria-hidden="true">{sort === column ? direction === "asc" ? " ↑" : " ↓" : " ↕"}</span></button>}
        </div>
        <span className="browse__column-resize" role="separator" aria-orientation="vertical" aria-label={`Resize ${columnNames[column]} column`} aria-valuemin={80} aria-valuemax={800} aria-valuenow={widths[column]} tabIndex={0}
          onPointerDown={event => startResize(event, column)} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize} onLostPointerCapture={() => { resize.current = null; }}
          onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); changeWidth(column, event.key === "Home" ? 80 : event.key === "End" ? 800 : widths[column] + (event.key === "ArrowLeft" ? -10 : 10)); } }} />
      </th>)}</tr></thead>
      {/* One row group per result, so an open album's songs travel (and are measured) with it. */}
      {pieces.map(piece => {
        if (piece.kind === "gap") return <tbody key={`gap-${piece.from}`} className="browse__spacer" aria-hidden="true"><tr><td colSpan={visible.length} style={{ height: piece.height }} /></tr></tbody>;
        const row = rowAt(piece.index);
        if (!row) return <tbody key={`wait-${piece.index}`} data-index={piece.index} data-waiting=""><tr aria-rowindex={piece.index + 2} className="browse__waiting" style={{ height: body.expected(piece.index) }}><th scope="row" colSpan={visible.length}><span className="muted">Loading…</span></th></tr></tbody>;
        const more = detail(row);
        return <tbody key={`${row.type}:${row.key}`} data-index={piece.index} className={more ? "is-open" : undefined}>
          <tr aria-rowindex={piece.index + 2} {...rowEvents(row)}>{visible.map(column => column === "title" ? <th key={column} scope="row" data-column={column}>{titleCell(row)}</th> : <td key={column} data-column={column}>{column === "actions" ? actions(row) : cell(row, column)}</td>)}</tr>
          {more && <tr className="browse__detail"><td colSpan={visible.length}>{more}</td></tr>}
        </tbody>;
      })}
    </table></div>
  </>;
}
