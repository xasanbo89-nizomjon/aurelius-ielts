import type { NavIconName } from "@/lib/nav-icons";

export type NavItem = {
  label: string;
  href: string;
  icon: NavIconName;
};

// Phase 20 — Final UX Restructure: the sidebar carries only Home, Profile
// and Settings. Tests/Articles/Writing/Speaking are reached exclusively
// through the 4 home-hub cards now, not the sidebar. None of those routes
// or their data were removed — only how they're navigated to.
export const STUDENT_NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/student/dashboard", icon: "LayoutDashboard" },
  { label: "Profile", href: "/student/profile", icon: "UserCircle" },
  { label: "Settings", href: "/student/settings", icon: "Settings" },
];

/**
 * Secondary student destinations, surfaced from the profile menu instead of
 * the sidebar. Vocabulary was removed from here in Phase 20 — it now works
 * inside Articles only (see the Words panel on the article reader); the
 * standalone /student/vocabulary pages still exist and still work, they're
 * just no longer linked from primary navigation.
 */
export const STUDENT_SECONDARY_NAV_ITEMS: NavItem[] = [
  { label: "Success Center", href: "/student/success", icon: "Sparkles" },
  { label: "Study Coach", href: "/student/study-coach", icon: "Target" },
  { label: "Band Score Center", href: "/student/analytics", icon: "LineChart" },
  { label: "Test History", href: "/student/test-history", icon: "History" },
  { label: "Bookmarks", href: "/student/bookmarks", icon: "Bookmark" },
  { label: "Coin Wallet", href: "/student/coins", icon: "Coins" },
  { label: "Leaderboard", href: "/student/leaderboard", icon: "Trophy" },
  { label: "Subscription", href: "/student/subscription", icon: "Gem" },
  // Phase 28 — Offline learning. "Offline Articles" links straight to the
  // network-independent /offline/* viewer (not a /student/* page), since
  // it must keep working with zero connection.
  { label: "Downloads", href: "/student/downloads", icon: "Download" },
  { label: "Offline Articles", href: "/offline/articles", icon: "WifiOff" },
];

export const TEACHER_NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/teacher/dashboard", icon: "LayoutDashboard" },
  { label: "AI Assistant", href: "/teacher/assistant", icon: "Sparkles" },
  { label: "Students", href: "/teacher/students", icon: "Users" },
  { label: "Tests", href: "/teacher/tests", icon: "FileText" },
  { label: "Articles", href: "/teacher/articles", icon: "Newspaper" },
  { label: "Speaking", href: "/teacher/speaking", icon: "Mic" },
  { label: "Assignments", href: "/teacher/assignments", icon: "ListChecks" },
  { label: "Writing", href: "/teacher/writing", icon: "NotebookPen" },
  { label: "Writing Reviews", href: "/teacher/writing-reviews", icon: "PenLine" },
  { label: "Analytics", href: "/teacher/analytics", icon: "BarChart3" },
  // Renamed from "Band Conversion" — it kept getting read as a duplicate of
  // "Band Conversation" right below it. They're unrelated: this is the
  // raw-score-to-band scale editor that live exam scoring actually reads
  // from (src/lib/exam/attempts.ts); Band Conversation is the analytics
  // dashboard. Neither is deletable/duplicate — only the confusing label was.
  { label: "Score Scale", href: "/teacher/band-conversion", icon: "Scale" },
  { label: "Band Conversation", href: "/teacher/band-conversation", icon: "LineChart" },
  { label: "Updates", href: "/teacher/updates", icon: "Megaphone" },
  { label: "Promo Codes", href: "/teacher/promo-codes", icon: "Ticket" },
  { label: "Payments", href: "/teacher/payments", icon: "CreditCard" },
  { label: "Coin Logs", href: "/teacher/coin-logs", icon: "Coins" },
  { label: "Subscription Plans", href: "/teacher/subscriptions", icon: "Gem" },
  { label: "Teacher Management", href: "/teacher/management", icon: "ShieldCheck" },
];
