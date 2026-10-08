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
  // Phase 37 — Speaking Practice Center, explicitly requested as a real
  // sidebar item (an intentional exception to the Phase 20 minimalism
  // above). Route is /student/speaking-practice, not /student/speaking —
  // that path is already the existing audio-recording Speaking system
  // (code entry + Whisper transcription); this is a separate, simpler
  // typed-answer practice tool. See schema.prisma's Speaking Practice
  // Center section comment for the full naming rationale.
  { label: "Speaking Practice", href: "/student/speaking-practice", icon: "Mic" },
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
  // Phase 47 — Mock Exam Center, directly reachable without fighting the
  // Phase 20 sidebar minimalism above (Tests/Full Mock stays reachable
  // through the /student/tests hub card too — this is a second path, not a
  // replacement).
  { label: "Mock Exams", href: "/student/tests/mock", icon: "ClipboardCheck" },
  // Phase 45 — Media Library 2.0.
  { label: "Reading Library", href: "/student/reading-library", icon: "BookOpen" },
  { label: "Listening Library", href: "/student/listening-library", icon: "Headphones" },
  { label: "Success Center", href: "/student/success", icon: "Sparkles" },
  { label: "Study Coach", href: "/student/study-coach", icon: "Target" },
  { label: "Band Score Center", href: "/student/analytics", icon: "LineChart" },
  { label: "Test History", href: "/student/test-history", icon: "History" },
  { label: "Bookmarks", href: "/student/bookmarks", icon: "Bookmark" },
  { label: "Leaderboard", href: "/student/leaderboard", icon: "Trophy" },
  { label: "Premium", href: "/student/premium", icon: "Crown" },
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
  // Phase O - one page for every student's Listening, Reading, Writing (latest Full Mock), Speaking (latest AI practice) and Overall band.
  { label: "Students' Scores", href: "/teacher/scores", icon: "Trophy" },
  // Phase C — every student's Reading / Listening / Writing / Full Mock result in one place, plus per-student monitoring.
  { label: "Student Results", href: "/teacher/results", icon: "ClipboardList" },
  // Phase 38 — central reusable file store for Reading/Listening/Articles.
  { label: "Media Library", href: "/teacher/media", icon: "Image" },
  { label: "Tests", href: "/teacher/tests", icon: "FileText" },
  // Phase 51 — Mock Access Code System's teacher-wide scoreboard, across every Full Mock Test.
  { label: "Mock Results", href: "/teacher/mock-results", icon: "ClipboardCheck" },
  // Phase K - who is sitting a Full Mock right now: section, progress, time left on the server's clock, last save.
  { label: "Live Monitor", href: "/teacher/mock-monitor", icon: "Activity" },
  { label: "Articles", href: "/teacher/articles", icon: "Newspaper" },
  // Phase 45 — Media Library 2.0: real standalone browsable content,
  // distinct from Tests (timed/graded MockTests) and Articles (interactive
  // plain-text reading).
  { label: "Reading Library", href: "/teacher/reading-library", icon: "BookOpen" },
  { label: "Listening Library", href: "/teacher/listening-library", icon: "Headphones" },
  { label: "Speaking", href: "/teacher/speaking", icon: "Mic" },
  // Phase 37 — Speaking Practice Center's teacher-side topic bank. Separate
  // from "Speaking" above (the existing audio-recording task bank).
  { label: "Speaking Topics", href: "/teacher/speaking-topics", icon: "MessageCircle" },
  // Phase Q-B - the students' recorded Speaking practices with their AI assessment: listen, read the feedback, comment. (A Root Teacher also finds the usage page here.)
  { label: "Speaking Recordings", href: "/teacher/speaking-recordings", icon: "AudioLines" },
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
  { label: "Premium Requests", href: "/teacher/premium", icon: "Crown" },
  { label: "Premium Plans", href: "/teacher/premium-plans", icon: "Gem" },
  { label: "System Health", href: "/teacher/system-health", icon: "Activity" },
  { label: "Subscription Plans", href: "/teacher/subscriptions", icon: "Gem" },
  { label: "Teacher Management", href: "/teacher/management", icon: "ShieldCheck" },
];
