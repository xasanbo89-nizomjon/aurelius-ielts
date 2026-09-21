"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { Loader2, LogOut, User as UserIcon } from "lucide-react";

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
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: "STUDENT" | "TEACHER";
}) {
  const router = useRouter();
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await clearSessionAction();
    await signOut(getFirebaseAuth());
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Account menu${name ? ` for ${name}` : ""}`}
          className="focus-visible:ring-ring/50 flex items-center gap-2.5 rounded-full p-1 pr-1 outline-none transition-colors hover:bg-secondary focus-visible:ring-2"
        >
          <Avatar>
            <AvatarImage src={image ?? undefined} alt={name ?? "User"} />
            <AvatarFallback>{getInitials(name, email)}</AvatarFallback>
          </Avatar>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-medium">{name ?? "Account"}</span>
            <span className="text-muted-foreground block text-xs capitalize">{role.toLowerCase()}</span>
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-foreground text-sm font-medium">{name ?? "Account"}</span>
            <span className="text-muted-foreground truncate text-xs font-normal">{email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={role === "TEACHER" ? "/teacher/dashboard" : "/student/dashboard"}>
              <UserIcon /> My account
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={(event) => {
              event.preventDefault();
              setConfirmSignOutOpen(true);
            }}
          >
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmSignOutOpen} onOpenChange={setConfirmSignOutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out of Aurelius IELTS?</DialogTitle>
            <DialogDescription>
              You&apos;ll need to sign in again to access your dashboard.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={signingOut}>
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
