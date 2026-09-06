import type { AttentionRow } from "./demo-data";

export function dashboardAttentionHref(row: Pick<AttentionRow, "geometry" | "id">) {
  if (row.geometry === "clinical") return "/clinical";
  if (row.geometry === "finance") return "/billing";
  const selectionKind = row.geometry === "booking" ? "request" : "appointment";
  return `/calendar?selected=${selectionKind}:${row.id}`;
}
