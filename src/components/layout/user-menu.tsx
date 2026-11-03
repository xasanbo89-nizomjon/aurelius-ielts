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
          className="focus-visible:ring-ring/50 group flex items-center gap-2.5 rounded-full border border-amber-500/20 bg-[#131622]/25 dark:bg-[#131622]/25 light:bg-white/60 p-1 pr-2.5 outline-none backdrop-blur-xl shadow-[0_4px_16px_rgba(0,0,0,0.35),0_0_15px_rgba(217,178,86,0.12)] transition-all duration-300 hover:border-amber-400/40 hover:bg-amber-500/10 focus-visible:ring-2"
        >
          <Avatar className="size-8 ring-1.5 ring-amber-400/60 shadow-[0_0_10px_rgba(245,158,11,0.25)]">
            <AvatarImage src={image ?? undefined} alt={displayName} />
            <AvatarFallback className="bg-amber-950/70 dark:bg-amber-950/70 light:bg-amber-100 font-display text-xs font-semibold text-amber-200/90 dark:text-amber-200/90 light:text-amber-900">
              {getInitials(displayName, email)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-left leading-tight sm:block">
            <span className="font-display block text-sm font-semibold tracking-tight text-amber-100/90 dark:text-amber-100/90 light:text-slate-850 group-hover:text-amber-100">
              {displayName}
            </span>
            <span className="block text-xs font-medium text-amber-300/70 dark:text-amber-300/70 light:text-amber-700 capitalize">
              {role === "STUDENT" ? "Student" : role.toLowerCase()}
            </span>
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56 border border-amber-500/20 bg-[#0e111b]/85 dark:bg-[#0e111b]/85 light:bg-white/95 text-amber-100/90 dark:text-amber-100/90 light:text-slate-800 shadow-[0_12px_36px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
        >
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="font-display text-sm font-semibold text-amber-100/90 dark:text-amber-100/90 light:text-slate-900">{displayName}</span>
            <span className="truncate text-xs font-normal text-amber-200/60 dark:text-amber-200/60 light:text-slate-500">{email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-amber-500/15" />
          {role === "STUDENT" ? (
            <>
              <DropdownMenuItem asChild className="focus:bg-amber-500/15 focus:text-amber-200 cursor-pointer">
                <Link href="/student/profile">
                  <UserCircle className="text-amber-400/80" /> My Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="focus:bg-amber-500/15 focus:text-amber-200 cursor-pointer">
                <Link href="/student/settings">
                  <Settings className="text-amber-400/80" /> Settings
                </Link>
              </DropdownMenuItem>
              {secondaryItems && secondaryItems.length > 0 && (
                <>
                  <DropdownMenuSeparator className="bg-amber-500/15" />
                  {secondaryItems.map((item) => {
                    const Icon = NAV_ICONS[item.icon];
                    return (
                      <DropdownMenuItem
                        key={item.href}
                        asChild
                        className="focus:bg-amber-500/15 focus:text-amber-200 cursor-pointer"
                      >
                        <Link href={item.href}>
                          <Icon className="text-amber-400/75" /> {item.label}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </>
              )}
            </>
          ) : (
            <DropdownMenuItem asChild className="focus:bg-amber-500/15 focus:text-amber-200 cursor-pointer">
              <Link href="/teacher/dashboard">
                <UserIcon className="text-amber-400/80" /> My account
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="bg-amber-500/15" />
          <DropdownMenuItem
            variant="destructive"
            className="cursor-pointer"
            onSelect={(event) => {
              event.preventDefault();
              setConfirmSignOutOpen(true);
            }}
          >
            <LogOut /> {role === "STUDENT" ? "Logout" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmSignOutOpen} onOpenChange={setConfirmSignOutOpen}>
        <DialogContent className="border border-amber-500/20 bg-[#0e111b]/95 dark:bg-[#0e111b]/95 light:bg-white text-amber-100/90 dark:text-amber-100/90 light:text-slate-800">
          <DialogHeader>
            <DialogTitle className="text-amber-100/90 dark:text-amber-100/90 light:text-slate-900">Sign out of Aurelius IELTS?</DialogTitle>
            <DialogDescription className="text-amber-200/65 dark:text-amber-200/65 light:text-slate-600">
              You&apos;ll need to sign in again to access your dashboard.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                variant="outline"
                disabled={signingOut}
                className="border-amber-500/20 text-amber-100/85 dark:text-amber-100/85 light:text-slate-700 hover:bg-amber-500/10"
              >
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleSignOut} disabled={signingOut}>
              {signingOut && <Loader2 className="size-4 animate-spin" />}
              Sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
