import Link from "next/link";
import { Icon } from "@/components/workspace/icon";

const labels: Record<string, string> = {
  patients: "Patients",
  clinical: "Clinical",
  billing: "Billing",
  reports: "Reports",
  notifications: "Notifications",
  settings: "Settings",
  help: "Help",
};

export default async function SectionPlaceholder({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const label = labels[section] ?? "Workspace";
  return (
    <div className="module-placeholder">
      <Icon name="clipboard" size={26} />
      <h1>{label}</h1>
      <p>This module is represented in the approved product flow but is outside the current Dashboard and Calendar foundation.</p>
      <Link href="/dashboard" className="button button-primary"><Icon name="chevron-left" size={16} />Back to Dashboard</Link>
    </div>
  );
}
