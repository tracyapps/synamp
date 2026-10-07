/** Browser-local presentation only. Never changes library tags or release identity. */
export const columnNames = { title: "Title", type: "Type", artist: "Artist / credit", album_artist: "Album artist", album: "Album", year: "Year", count: "Songs", duration: "Duration", genre: "Genre", actions: "Actions" } as const;
export type Column = keyof typeof columnNames;
export type SortColumn = Exclude<Column, "actions">;
export const columnOrder = Object.keys(columnNames) as Column[];
export const defaultWidths: Record<Column, number> = { title: 260, type: 100, artist: 200, album_artist: 200, album: 200, year: 100, count: 100, duration: 120, genre: 180, actions: 210 };
export const TABLE_KEY = "synamp-library-view-v2";
export type Presentation = { view: string; columns: Column[]; order: Column[]; widths: Record<Column, number>; sort: SortColumn; direction: "asc" | "desc" };
const validColumn = (value: unknown): value is Column => typeof value === "string" && Object.hasOwn(columnNames, value);
export function columnWidth(value: number, fallback = 160): number { return Number.isFinite(value) ? Math.round(Math.min(800, Math.max(80, value))) : fallback; }
export function readPresentation(saved: unknown): Presentation {
  const data = saved && typeof saved === "object" ? saved as Partial<Omit<Presentation, "sort">> & { sort?: unknown } : {};
  const order = Array.isArray(data.order) ? [...new Set(data.order.filter(validColumn))] : [];
  const columns = Array.isArray(data.columns) ? [...new Set(data.columns.filter(validColumn))] : ["type", "artist", "album", "year", "count", "duration"] as Column[];
  const widths = { ...defaultWidths };
  for (const column of columnOrder) if (typeof data.widths?.[column] === "number") widths[column] = columnWidth(data.widths[column], widths[column]);
  return { view: ["list", "grid", "table"].includes(data.view ?? "") ? data.view! : "list", columns: [...new Set<Column>(["title", ...columns, "actions"])], order: [...order, ...columnOrder.filter(column => !order.includes(column))], widths,
    sort: validColumn(data.sort) && data.sort !== "actions" ? data.sort : "artist", direction: data.direction === "desc" ? "desc" : "asc" };
}
export function moveColumn(order: Column[], column: Column, target: Column): Column[] {
  if (column === target || !order.includes(column) || !order.includes(target)) return order;
  const next = order.filter(value => value !== column);
  // Moving right places after the target; moving left places before it.
  next.splice(next.indexOf(target) + (order.indexOf(column) < order.indexOf(target) ? 1 : 0), 0, column);
  return next;
}
