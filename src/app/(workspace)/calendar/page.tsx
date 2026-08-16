import type { Metadata } from "next";
import { CalendarWorkspace } from "@/components/workspace/calendar-workspace";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const selected = typeof params.selected === "string" ? params.selected : undefined;
  return <CalendarWorkspace initialSelectedId={selected} openNew={params.new === "1"} />;
}

