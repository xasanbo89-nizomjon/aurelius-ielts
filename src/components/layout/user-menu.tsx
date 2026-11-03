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
              ? "border border-amber-500/20 bg-[#131622]/25 backdrop-blur-xl shadow-[0_4px_16px_rgba(0,0,0,0.35),0_0_15px_rgba(217,178,86,0.12)] hover:border-amber-400/40 hover:bg-amber-500/10"
              : "border border-[#e6ddc9] bg-[#f0e9dc]/70 text-[#201d18] hover:bg-[#f0e9dc]"
          )}
        >
          <Avatar
            className={cn(
              "size-8",
              isDark
                ? "ring-1.5 ring-amber-400/60 shadow-[0_0_10px_rgba(245,158,11,0.25)]"
                : "ring-1 ring-[#e6ddc9]"
            )}
          >
            <AvatarImage src={image ?? undefined} alt={displayName} />
            <AvatarFallback
              className={cn(
                "font-display text-xs font-semibold",
                isDark ? "bg-amber-950/70 text-amber-200/90" : "bg-[#211d17] text-[#faf8f3]"
              )}
            >
              {getInitials(displayName, email)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-left leading-tight sm:block">
            <span
              className={cn(
                "font-display block text-sm font-semibold tracking-tight transition-colors",
                isDark ? "text-amber-100/90 group-hover:text-amber-100" : "text-[#201d18]"
              )}
            >
              {displayName}
            </span>
            <span
              className={cn(
                "block text-xs font-medium capitalize",
                isDark ? "text-amber-300/70" : "text-[#785a29]"
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
              ? "border border-amber-500/20 bg-[#0e111b]/95 text-amber-100/90 shadow-[0_12px_36px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
              : "border border-[#e6ddc9] bg-white text-[#201d18] shadow-lg"
          )}
        >
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span
              className={cn(
                "font-display text-sm font-semibold",
                isDark ? "text-amber-100/90" : "text-[#201d18]"
              )}
            >
              {displayName}
            </span>
            <span
              className={cn(
                "truncate text-xs font-normal",
                isDark ? "text-amber-200/60" : "text-[#726b5d]"
              )}
            >
              {email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className={isDark ? "bg-amber-500/15" : "bg-[#e6ddc9]"} />
          {role === "STUDENT" ? (
            <>
              <DropdownMenuItem
                asChild
                className={cn(
                  "cursor-pointer",
                  isDark ? "focus:bg-amber-500/15 focus:text-amber-200" : "focus:bg-[#f0e9dc] focus:text-[#201d18]"
                )}
              >
                <Link href="/student/profile">
                  <UserCircle className={isDark ? "text-amber-400/80" : "text-[#785a29]"} /> My Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                asChild
                className={cn(
                  "cursor-pointer",
                  isDark ? "focus:bg-amber-500/15 focus:text-amber-200" : "focus:bg-[#f0e9dc] focus:text-[#201d18]"
                )}
              >
                <Link href="/student/settings">
                  <Settings className={isDark ? "text-amber-400/80" : "text-[#785a29]"} /> Settings
                </Link>
              </DropdownMenuItem>
              {secondaryItems && secondaryItems.length > 0 && (
                <>
                  <DropdownMenuSeparator className={isDark ? "bg-amber-500/15" : "bg-[#e6ddc9]"} />
                  {secondaryItems.map((item) => {
                    const Icon = NAV_ICONS[item.icon];
                    return (
                      <DropdownMenuItem
                        key={item.href}
                        asChild
                        className={cn(
                          "cursor-pointer",
                          isDark ? "focus:bg-amber-500/15 focus:text-amber-200" : "focus:bg-[#f0e9dc] focus:text-[#201d18]"
                        )}
                      >
                        <Link href={item.href}>
                          <Icon className={isDark ? "text-amber-400/75" : "text-[#785a29]"} /> {item.label}
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
                isDark ? "focus:bg-amber-500/15 focus:text-amber-200" : "focus:bg-[#f0e9dc] focus:text-[#201d18]"
              )}
            >
              <Link href="/teacher/dashboard">
                <UserIcon className={isDark ? "text-amber-400/80" : "text-[#785a29]"} /> My account
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className={isDark ? "bg-amber-500/15" : "bg-[#e6ddc9]"} />
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
              ? "border border-amber-500/20 bg-[#0c0e17]/95 text-amber-100 backdrop-blur-2xl"
              : "border border-[#e6ddc9] bg-white text-[#201d18]"
          )}
        >
          <DialogHeader>
            <DialogTitle>Log out of Aurelius IELTS?</DialogTitle>
            <DialogDescription className={isDark ? "text-amber-200/70" : "text-[#726b5d]"}>
              You will need to sign in again to access your practice tests and progress.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                disabled={signingOut}
                className={isDark ? "border-amber-500/20 bg-transparent text-amber-100 hover:bg-amber-500/10" : ""}
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
