import type { Metadata } from "next";
import {
  DashboardWorkspace,
  type DashboardAttentionState,
} from "@/components/workspace/dashboard-workspace";
import { getDemoReschedulingCase } from "@/lib/demo-rescheduling";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const supportedStates = new Set<DashboardAttentionState>([
  "active",
  "resolved",
  "coverage-limited",
  "loading",
  "error",
]);

type DashboardPageProps = {
  searchParams: Promise<{ state?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { state } = await searchParams;
  const attentionState = supportedStates.has(state as DashboardAttentionState)
    ? (state as DashboardAttentionState)
    : "active";
  const demoReschedulingCase = getDemoReschedulingCase();

  return (
    <DashboardWorkspace
      attentionState={attentionState}
      initialDemoReschedulingCase={demoReschedulingCase}
    />
  );
}
