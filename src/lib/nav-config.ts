import type { NavIconName } from "@/lib/nav-icons";

export type NavItem = {
  label: string;
  href: string;
  icon: NavIconName;
};

// Phase 19 — Student Experience Redesign: the sidebar/mobile nav only
// carries the primary learning-hub destinations now. Listening/Reading/Full
// Mock Test live inside the Tests hub (/student/tests) instead of as
// separate entries, and Vocabulary/Study Coach/Analytics/Test
// History/Subscription moved to STUDENT_SECONDARY_NAV_ITEMS (surfaced from
// the profile menu) — none of those routes or their data were removed.
export const STUDENT_NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/student/dashboard", icon: "LayoutDashboard" },
  { label: "Tests", href: "/student/tests", icon: "ClipboardCheck" },
  { label: "Articles", href: "/student/articles", icon: "Newspaper" },
  { label: "Writing", href: "/student/writing", icon: "PenLine" },
  { label: "Speaking", href: "/student/speaking", icon: "Mic" },
];

/** Secondary student destinations, surfaced from the profile menu instead of the sidebar. */
export const STUDENT_SECONDARY_NAV_ITEMS: NavItem[] = [
  { label: "Vocabulary", href: "/student/vocabulary", icon: "BookMarked" },
  { label: "Study Coach", href: "/student/study-coach", icon: "Target" },
  { label: "Analytics", href: "/student/analytics", icon: "LineChart" },
  { label: "Test History", href: "/student/test-history", icon: "History" },
  { label: "Subscription", href: "/student/subscription", icon: "Gem" },
];

export const TEACHER_NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/teacher/dashboard", icon: "LayoutDashboard" },
  { label: "Students", href: "/teacher/students", icon: "Users" },
  { label: "Tests", href: "/teacher/tests", icon: "FileText" },
  { label: "Articles", href: "/teacher/articles", icon: "Newspaper" },
  { label: "Assignments", href: "/teacher/assignments", icon: "ListChecks" },
  { label: "Writing", href: "/teacher/writing", icon: "NotebookPen" },
  { label: "Writing Reviews", href: "/teacher/writing-reviews", icon: "PenLine" },
  { label: "Analytics", href: "/teacher/analytics", icon: "BarChart3" },
  { label: "Band Conversion", href: "/teacher/band-conversion", icon: "Scale" },
  { label: "Band Conversation", href: "/teacher/band-conversation", icon: "LineChart" },
  { label: "Updates", href: "/teacher/updates", icon: "Megaphone" },
  { label: "Promo Codes", href: "/teacher/promo-codes", icon: "Ticket" },
  { label: "Payments", href: "/teacher/payments", icon: "CreditCard" },
  { label: "Subscription Plans", href: "/teacher/subscriptions", icon: "Gem" },
  { label: "Teacher Management", href: "/teacher/management", icon: "ShieldCheck" },
];
