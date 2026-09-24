import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Headphones,
  BookOpen,
  PenLine,
  ClipboardCheck,
  Users,
  FileText,
  ListChecks,
  BarChart3,
  Ticket,
  CreditCard,
  Gem,
  LineChart,
  History,
  Scale,
  Megaphone,
  Target,
  ShieldCheck,
  Newspaper,
  BookMarked,
  NotebookPen,
  UserCircle,
  Mic,
  Settings,
  Bookmark,
  Sparkles,
  Coins,
  Trophy,
  Download,
  WifiOff,
} from "lucide-react";

/**
 * Icon registry keyed by string, not component reference. Nav items are
 * built in Server Components (the dashboard layouts) and then flow as
 * props into SidebarNav/MobileSidebar, which are Client Components —
 * function/component references can't cross that Server->Client boundary
 * as serialized props, only plain data can. So NavItem.icon stores one of
 * these keys, and the actual component is resolved locally inside the
 * client component via this map.
 */
export const NAV_ICONS = {
  LayoutDashboard,
  Headphones,
  BookOpen,
  PenLine,
  ClipboardCheck,
  Users,
  FileText,
  ListChecks,
  BarChart3,
  Ticket,
  CreditCard,
  Gem,
  LineChart,
  History,
  Scale,
  Megaphone,
  Target,
  ShieldCheck,
  Newspaper,
  BookMarked,
  NotebookPen,
  UserCircle,
  Mic,
  Settings,
  Bookmark,
  Sparkles,
  Coins,
  Trophy,
  Download,
  WifiOff,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof NAV_ICONS;
