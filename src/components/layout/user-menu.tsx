"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "firebase/auth";
import { Loader2, LogOut, Settings, User as UserIcon, UserCircle } from "lucide-react";

import type { NavItem } from "@/lib/nav-config";
import { NAV_ICONS } from "@/lib/nav-icons";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { clearSessionAction } from "@/actions/session.actions";
import { getInitials } from "@/lib/avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function UserMenu({
  name,
  email,
  image,
  role,
  secondaryItems,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: "STUDENT" | "TEACHER";
  /** Student-only: secondary destinations (Vocabulary, Analytics, etc.) that no longer live in the sidebar. */
  secondaryItems?: NavItem[];
}) {
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { isDark } = useTheme();

  async function handleSignOut() {
    setSigningOut(true);
    await clearSessionAction();
    await signOut(getFirebaseAuth());
    window.location.href = "/";
  }

  const displayName = name?.trim() || "Xasan";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Account menu for ${displayName}`}
          className={cn(
            "focus-visible:ring-ring/50 group flex items-center gap-2.5 rounded-full p-1 pr-2.5 outline-none transition-all duration-300 focus-visible:ring-2",
            isDark
              ? "border border-slate-700 bg-slate-800/60 backdrop-blur-xl shadow-sm hover:border-blue-500"
              : "border border-slate-200 bg-slate-100/80 text-slate-900 hover:bg-slate-200"
          )}
        >
          <Avatar
            className={cn(
              "size-8",
              isDark
                ? "ring-1.5 ring-blue-500/60 shadow-sm"
                : "ring-1 ring-slate-300"
            )}
          >
            <AvatarImage src={image ?? undefined} alt={displayName} />
            <AvatarFallback
              className={cn(
                "font-display text-xs font-semibold",
                isDark ? "bg-blue-950 text-blue-200" : "bg-blue-600 text-white"
              )}
            >
              {getInitials(displayName, email)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-left leading-tight sm:block">
            <span
              className={cn(
                "font-display block text-sm font-semibold tracking-tight transition-colors",
                isDark ? "text-slate-100 group-hover:text-blue-300" : "text-blue-950"
              )}
            >
              {displayName}
            </span>
            <span
              className={cn(
                "block text-xs font-medium capitalize",
                isDark ? "text-blue-400" : "text-blue-600"
              )}
            >
              {role === "STUDENT" ? "Student" : role.toLowerCase()}
            </span>
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className={cn(
            "w-56",
            isDark
              ? "border border-slate-800 bg-[#0e111b]/95 text-slate-100 shadow-xl backdrop-blur-2xl"
              : "border border-slate-200 bg-white text-slate-900 shadow-lg"
          )}
        >
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span
              className={cn(
                "font-display text-sm font-semibold",
                isDark ? "text-slate-100" : "text-blue-950"
              )}
            >
              {displayName}
            </span>
            <span
              className={cn(
                "truncate text-xs font-normal",
                isDark ? "text-slate-400" : "text-slate-500"
              )}
            >
              {email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className={isDark ? "bg-slate-800" : "bg-slate-200"} />
          {role === "STUDENT" ? (
            <>
              <DropdownMenuItem
                asChild
                className={cn(
                  "cursor-pointer",
                  isDark ? "focus:bg-blue-950/40 focus:text-blue-300" : "focus:bg-blue-50 focus:text-blue-900"
                )}
              >
                <Link href="/student/profile">
                  <UserCircle className={isDark ? "text-blue-400" : "text-blue-600"} /> My Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                asChild
                className={cn(
                  "cursor-pointer",
                  isDark ? "focus:bg-blue-950/40 focus:text-blue-300" : "focus:bg-blue-50 focus:text-blue-900"
                )}
              >
                <Link href="/student/settings">
                  <Settings className={isDark ? "text-blue-400" : "text-blue-600"} /> Settings
                </Link>
              </DropdownMenuItem>
              {secondaryItems && secondaryItems.length > 0 && (
                <>
                  <DropdownMenuSeparator className={isDark ? "bg-slate-800" : "bg-slate-200"} />
                  {secondaryItems.map((item) => {
                    const Icon = NAV_ICONS[item.icon];
                    return (
                      <DropdownMenuItem
                        key={item.href}
                        asChild
                        className={cn(
                          "cursor-pointer",
                          isDark ? "focus:bg-blue-950/40 focus:text-blue-300" : "focus:bg-blue-50 focus:text-blue-900"
                        )}
                      >
                        <Link href={item.href}>
                          <Icon className={isDark ? "text-blue-400" : "text-blue-600"} /> {item.label}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </>
              )}
            </>
          ) : (
            <DropdownMenuItem
              asChild
              className={cn(
                "cursor-pointer",
                isDark ? "focus:bg-blue-950/40 focus:text-blue-300" : "focus:bg-blue-50 focus:text-blue-900"
              )}
            >
              <Link href="/teacher/dashboard">
                <UserIcon className={isDark ? "text-blue-400" : "text-blue-600"} /> My account
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className={isDark ? "bg-slate-800" : "bg-slate-200"} />
          <DropdownMenuItem
            className={cn(
              "text-destructive cursor-pointer",
              isDark ? "focus:bg-destructive/15 focus:text-destructive" : "focus:bg-destructive/10"
            )}
            onSelect={(e) => {
              e.preventDefault();
              setConfirmSignOutOpen(true);
            }}
          >
            <LogOut /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmSignOutOpen} onOpenChange={setConfirmSignOutOpen}>
        <DialogContent
          className={cn(
            isDark
              ? "border border-slate-800 bg-[#0c0e17]/95 text-slate-100 backdrop-blur-2xl"
              : "border border-slate-200 bg-white text-slate-900"
          )}
        >
          <DialogHeader>
            <DialogTitle>Log out of Aurelius IELTS?</DialogTitle>
            <DialogDescription className={isDark ? "text-slate-400" : "text-slate-600"}>
              You will need to sign in again to access your practice tests and progress.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                disabled={signingOut}
                className={isDark ? "border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800" : ""}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Signing out...
                </>
              ) : (
                "Log out"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
