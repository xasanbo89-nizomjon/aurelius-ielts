import type { NavIconName } from "@/lib/nav-icons";

export type NavItem = {
  label: string;
  href: string;
  icon: NavIconName;
};

export const STUDENT_NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/student/dashboard", icon: "LayoutDashboard" },
  { label: "My Profile", href: "/student/profile", icon: "UserCircle" },
  { label: "Listening", href: "/student/listening", icon: "Headphones" },
  { label: "Reading", href: "/student/reading", icon: "BookOpen" },
  { label: "Writing", href: "/student/writing", icon: "PenLine" },
  { label: "Speaking", href: "/student/speaking", icon: "Mic" },
  { label: "Full Mock Test", href: "/student/mock-test", icon: "ClipboardCheck" },
  { label: "Articles", href: "/student/articles", icon: "Newspaper" },
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
  { label: "Speaking Reviews", href: "/teacher/speaking-reviews", icon: "Mic" },
  { label: "Analytics", href: "/teacher/analytics", icon: "BarChart3" },
  { label: "Band Conversion", href: "/teacher/band-conversion", icon: "Scale" },
  { label: "Updates", href: "/teacher/updates", icon: "Megaphone" },
  { label: "Promo Codes", href: "/teacher/promo-codes", icon: "Ticket" },
  { label: "Payments", href: "/teacher/payments", icon: "CreditCard" },
  { label: "Subscription Plans", href: "/teacher/subscriptions", icon: "Gem" },
  { label: "Teacher Management", href: "/teacher/management", icon: "ShieldCheck" },
];
