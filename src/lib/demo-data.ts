export type Provider = {
  id: string;
  name: string;
  shortName: string;
  specialty: string;
  tone: "blue" | "teal" | "lavender" | "green";
};

export type AppointmentStatus =
  | "confirmed"
  | "checked-in"
  | "in-treatment"
  | "awaiting-approval"
  | "completed"
  | "cancelled"
  | "no-show";

export type Appointment = {
  id: string;
  patient: string;
  initials: string;
  type: string;
  providerId: string;
  day?: string;
  startMinutes: number;
  duration: number;
  bufferAfter?: number;
  status: AppointmentStatus;
  phone: string;
  email?: string;
  note?: string;
  requestedBy?: string;
  requestedAt?: string;
};

export type BookingRequest = {
  id: string;
  patient: string;
  initials: string;
  type: string;
  providerId: string;
  requestedDay: string;
  startMinutes: number;
  duration: number;
  bufferAfter: number;
  phone: string;
  email?: string;
  requestedAt: string;
  note: string;
  status: "new" | "reviewing" | "contacted";
};

export type AttentionPriority = "act-now" | "today" | "soon" | "routine";

export type AttentionGeometry = "collision" | "clinical" | "booking" | "finance";

export type AttentionRow = {
  id: string;
  kind: string;
  patient: string;
  issue: string;
  time: string;
  priority: AttentionPriority;
  priorityLabel: string;
  whyNow: string;
  detail: string;
  metric: string;
  metricLabel: string;
  status: string;
  owner: string;
  action: string;
  geometry: AttentionGeometry;
  comparison?: Array<{
    time: string;
    patient: string;
    detail: string;
  }>;
};

export const providers: Provider[] = [
  {
    id: "patel",
    name: "Dr Aisha Patel",
    shortName: "Dr Patel",
    specialty: "General dentistry",
    tone: "lavender",
  },
  {
    id: "chen",
    name: "Dr Brian Chen",
    shortName: "Dr Chen",
    specialty: "Restorative",
    tone: "teal",
  },
  {
    id: "nguyen",
    name: "Dr Sarah Nguyen",
    shortName: "Dr Nguyen",
    specialty: "Endodontics",
    tone: "blue",
  },
  {
    id: "lee",
    name: "Dr Jason Lee",
    shortName: "Dr Lee",
    specialty: "General dentistry",
    tone: "green",
  },
];

export const initialAppointments: Appointment[] = [
  { id: "emma", patient: "Emma Johnson", initials: "EJ", type: "Exam", providerId: "patel", startMinutes: 480, duration: 60, bufferAfter: 15, status: "confirmed", phone: "(555) 224-8841", email: "emma.j@example.com" },
  { id: "daniel", patient: "Daniel Kim", initials: "DK", type: "Root canal #19", providerId: "patel", startMinutes: 570, duration: 90, bufferAfter: 15, status: "in-treatment", phone: "(555) 396-1120", note: "Patient requested a brief pause before imaging." },
  { id: "olivia", patient: "Olivia Garcia", initials: "OG", type: "Crown fitting", providerId: "patel", startMinutes: 780, duration: 60, bufferAfter: 15, status: "confirmed", phone: "(555) 639-0418" },
  { id: "ava", patient: "Ava Chen", initials: "AC", type: "Exam", providerId: "patel", startMinutes: 930, duration: 45, bufferAfter: 15, status: "confirmed", phone: "(555) 301-4438" },
  { id: "james", patient: "James Wilson", initials: "JW", type: "Exam + X-ray", providerId: "chen", startMinutes: 480, duration: 60, bufferAfter: 15, status: "confirmed", phone: "(555) 708-2914" },
  { id: "isabella", patient: "Isabella Rossi", initials: "IR", type: "Hygiene", providerId: "chen", startMinutes: 600, duration: 60, bufferAfter: 15, status: "checked-in", phone: "(555) 892-1107", email: "isabella.rossi@example.com" },
  { id: "noah-conflict", patient: "Noah Brown", initials: "NB", type: "Hygiene visit", providerId: "chen", day: "Tue, 8 Aug", startMinutes: 660, duration: 60, bufferAfter: 15, status: "confirmed", phone: "(555) 381-2047" },
  { id: "michael", patient: "Michael Thompson", initials: "MT", type: "Consultation", providerId: "chen", startMinutes: 690, duration: 45, bufferAfter: 15, status: "confirmed", phone: "(555) 430-6672" },
  { id: "ethan", patient: "Ethan Lee", initials: "EL", type: "Filling", providerId: "chen", startMinutes: 810, duration: 60, bufferAfter: 15, status: "confirmed", phone: "(555) 461-7730" },
  { id: "priya", patient: "Priya Shah", initials: "PS", type: "Hygiene", providerId: "chen", startMinutes: 930, duration: 60, bufferAfter: 15, status: "confirmed", phone: "(555) 616-8389" },
  { id: "lucas", patient: "Lucas Martin", initials: "LM", type: "Hygiene", providerId: "nguyen", startMinutes: 510, duration: 60, bufferAfter: 15, status: "confirmed", phone: "(555) 297-4021" },
  { id: "mia", patient: "Mia Davis", initials: "MD", type: "Exam", providerId: "nguyen", startMinutes: 600, duration: 60, bufferAfter: 15, status: "confirmed", phone: "(555) 513-8092" },
  { id: "henry", patient: "Henry Adams", initials: "HA", type: "Root canal #30", providerId: "nguyen", startMinutes: 660, duration: 120, bufferAfter: 15, status: "confirmed", phone: "(555) 401-1208" },
  { id: "chloe", patient: "Chloe Turner", initials: "CT", type: "Crown preparation", providerId: "nguyen", startMinutes: 810, duration: 75, bufferAfter: 15, status: "confirmed", phone: "(555) 197-6530" },
  { id: "benjamin", patient: "Benjamin Scott", initials: "BS", type: "Hygiene", providerId: "nguyen", startMinutes: 930, duration: 60, bufferAfter: 15, status: "confirmed", phone: "(555) 845-3371" },
  { id: "harper", patient: "Harper White", initials: "HW", type: "Exam", providerId: "lee", startMinutes: 510, duration: 60, bufferAfter: 15, status: "confirmed", phone: "(555) 278-0445" },
  { id: "william", patient: "William Harris", initials: "WH", type: "Hygiene", providerId: "lee", startMinutes: 600, duration: 60, bufferAfter: 15, status: "confirmed", phone: "(555) 908-7336" },
  { id: "logan", patient: "Logan Green", initials: "LG", type: "Exam", providerId: "lee", startMinutes: 690, duration: 45, bufferAfter: 15, status: "confirmed", phone: "(555) 241-6604" },
];

export const initialRequests: BookingRequest[] = [
  { id: "sofia-request", patient: "Sofia Martinez", initials: "SM", type: "Crown fitting", providerId: "patel", requestedDay: "Thu, 10 Aug", startMinutes: 855, duration: 60, bufferAfter: 15, phone: "(555) 222-3478", email: "sofia.martinez@example.com", requestedAt: "Yesterday, 4:18 PM", note: "Prefers a mid-afternoon appointment and text updates.", status: "new" },
  { id: "liam-request", patient: "Liam O’Connor", initials: "LO", type: "Exam + X-ray", providerId: "chen", requestedDay: "Wed, 9 Aug", startMinutes: 870, duration: 45, bufferAfter: 15, phone: "(555) 880-1244", requestedAt: "Yesterday, 5:02 PM", note: "New patient. Phone number verified.", status: "new" },
  { id: "priya-request", patient: "Priya Shah", initials: "PS", type: "Hygiene visit", providerId: "nguyen", requestedDay: "Fri, 11 Aug", startMinutes: 540, duration: 60, bufferAfter: 15, phone: "(555) 616-8389", requestedAt: "2 days ago", note: "Recurring visit request.", status: "new" },
];

export const attentionRows: AttentionRow[] = [
  {
    id: "noah-conflict",
    kind: "Schedule conflict",
    patient: "Noah Brown",
    issue: "Hygiene visit conflicts with an existing consultation",
    time: "Today · 11:00 AM",
    priority: "act-now",
    priorityLabel: "Act now",
    whyNow: "Two visits overlap Dr Chen by 30 minutes; the first starts in 12 minutes.",
    detail: "Dr Chen · Operatory 2 · 30 min overlap",
    metric: "12 min",
    metricLabel: "until first visit",
    status: "Needs resolution",
    owner: "Dr Chen",
    action: "Resolve clash",
    geometry: "collision",
    comparison: [
      { time: "11:00–12:00", patient: "Noah Brown", detail: "Hygiene · Op 2" },
      { time: "11:30–12:15", patient: "Michael Thompson", detail: "Consultation · Op 2" },
    ],
  },
  {
    id: "emma-note",
    kind: "Clinical follow-up",
    patient: "Emma Johnson",
    issue: "Root canal #19 record remains unsigned",
    time: "Visit · Today 9:30 AM",
    priority: "today",
    priorityLabel: "Due today",
    whyNow: "The record is still unsigned 1 hour 18 minutes after the visit.",
    detail: "Root canal #19 · Dr Chen · clinical owner",
    metric: "1h 18m",
    metricLabel: "unsigned",
    status: "Unsigned",
    owner: "Dr Chen",
    action: "Open task",
    geometry: "clinical",
  },
  {
    id: "liam-request",
    kind: "Booking request",
    patient: "Liam O’Connor",
    issue: "Exam + X-ray with Dr Chen",
    time: "Tomorrow · 2:30 PM",
    priority: "soon",
    priorityLabel: "Respond soon",
    whyNow: "The requested time is tomorrow; this is the oldest near-term request.",
    detail: "45 min · Dr Chen · provider requested",
    metric: "Tomorrow",
    metricLabel: "2:30 PM",
    status: "Awaiting approval",
    owner: "Maya Patel",
    action: "Review request",
    geometry: "booking",
  },
  {
    id: "sofia-request",
    kind: "Booking request",
    patient: "Sofia Martinez",
    issue: "Crown fitting with Dr Patel",
    time: "Thu, 10 Aug · 2:15 PM",
    priority: "soon",
    priorityLabel: "Respond soon",
    whyNow: "This near-term crown fitting request has been waiting since yesterday.",
    detail: "60 min · Dr Patel · text updates preferred",
    metric: "Thu 10 Aug",
    metricLabel: "2:15 PM",
    status: "Awaiting approval",
    owner: "Maya Patel",
    action: "Review request",
    geometry: "booking",
  },
  {
    id: "priya-request",
    kind: "Booking request",
    patient: "Priya Shah",
    issue: "Recurring hygiene visit with Dr Nguyen",
    time: "Fri, 11 Aug · 9:00 AM",
    priority: "routine",
    priorityLabel: "Routine",
    whyNow: "Flexible recurring request; no near-term care deadline is recorded.",
    detail: "60 min · Dr Nguyen · recurring visit",
    metric: "Fri 11 Aug",
    metricLabel: "9:00 AM",
    status: "Awaiting approval",
    owner: "Maya Patel",
    action: "Review request",
    geometry: "booking",
  },
  {
    id: "invoice",
    kind: "Invoice follow-up",
    patient: "Michael Thompson",
    issue: "Invoice #10482 requires an outreach outcome",
    time: "Due 21 Jul",
    priority: "routine",
    priorityLabel: "Routine",
    whyNow: "Financial follow-up is overdue; no care-blocking deadline is recorded.",
    detail: "Invoice #10482 · last contact 25 Jul",
    metric: "18 days",
    metricLabel: "open",
    status: "Follow-up needed",
    owner: "Billing",
    action: "Log outcome",
    geometry: "finance",
  },
];

export const weekCapacity = [
  { day: "Mon 7", values: [82, 76, 68, 71] },
  { day: "Tue 8", values: [85, 79, 71, 64] },
  { day: "Wed 9", values: [71, 86, 50, 71] },
  { day: "Thu 10", values: [92, 64, 75, 50] },
  { day: "Fri 11", values: [57, 50, 86, 43] },
];

export function minutesToTime(total: number) {
  const hours24 = Math.floor(total / 60);
  const minutes = total % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}
