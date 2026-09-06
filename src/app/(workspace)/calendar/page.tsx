import type { Metadata } from "next";
import { CalendarWorkspace } from "@/components/workspace/calendar-workspace";
import { parseCalendarWorkspaceContext } from "@/lib/calendar-workspace-model";
import { providers } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const selected = typeof params.selected === "string" ? params.selected : undefined;
  const initialContext = parseCalendarWorkspaceContext(params, providers.map((provider) => provider.id));
  return <CalendarWorkspace initialContext={initialContext} initialSelectedId={selected} openNew={params.new === "1"} />;
}
