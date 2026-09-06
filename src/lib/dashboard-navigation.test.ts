import assert from "node:assert/strict";
import test from "node:test";
import { resolveCalendarSelection } from "./calendar-workspace-model";
import { dashboardAttentionHref } from "./dashboard-navigation";
import { attentionRows, initialAppointments, initialRequests } from "./demo-data";

test("maps every dashboard attention action to its exact destination", () => {
  for (const row of attentionRows) {
    const href = dashboardAttentionHref(row);
    if (row.geometry === "clinical") {
      assert.equal(href, "/clinical");
      continue;
    }
    if (row.geometry === "finance") {
      assert.equal(href, "/billing");
      continue;
    }

    const url = new URL(href, "http://127.0.0.1");
    const selected = url.searchParams.get("selected") ?? undefined;
    assert.equal(resolveCalendarSelection(
      selected,
      initialAppointments,
      initialRequests,
    ).missing, false, row.id);
  }
});
