"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { endMockSectionAction, getMockMonitorAction } from "@/actions/mock-monitor.actions";
import type { MonitorRow, MonitorRowStatus, MonitorSnapshot } from "@/lib/mock-monitor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** How often the table asks the server for a fresh snapshot (while the tab is visible). */
const POLL_MS = 20_000;

const STATUS_LABEL: Record<MonitorRowStatus, string> = { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", SUBMITTED: "Submitted", EXPIRED: "Expired" };
const STATUS_VARIANT: Record<MonitorRowStatus, "outline" | "accent" | "success" | "destructive"> = { NOT_STARTED: "outline", IN_PROGRESS: "accent", SUBMITTED: "success", EXPIRED: "destructive" };

function clock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function ago(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 90) return `${Math.floor(seconds)} s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

export function MockMonitor({ initial, initialMockId }: { initial: MonitorSnapshot; initialMockId: string | null }) {
  const [snapshot, setSnapshot] = useState(initial);
  // The server's clock and ours differ by a little: every figure that counts down is worked out against the SERVER's "now" at the moment the snapshot was made.
  const [offsetMs, setOffsetMs] = useState(() => Date.parse(initial.generatedAt) - Date.now());
  const [, setTick] = useState(0);
  const [mockId, setMockId] = useState<string | null>(initialMockId);
  // Narrow the table by student or access code (done here: the rows are already in the browser).
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [ending, setEnding] = useState<MonitorRow | null>(null);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const mockIdRef = useRef(mockId);
  mockIdRef.current = mockId;

  const refresh = useCallback(async () => {
    if (inFlight.current) return; // never two polls at once (a slow one is not stacked on)
    inFlight.current = true;
    setRefreshing(true);
    try {
      const result = await getMockMonitorAction(mockIdRef.current);
      if (result.success) {
        setSnapshot(result.snapshot);
        setOffsetMs(Date.parse(result.snapshot.generatedAt) - Date.now());
        setError(null);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Connection lost - showing the last update.");
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  // Poll while the tab is visible; catch up at once when it becomes visible again.
  useEffect(() => {
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Tick every second so the clocks count down between polls.
  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Changing the mock filter asks for that mock's rows straight away.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void refresh();
  }, [mockId, refresh]);

  const serverNow = Date.now() + offsetMs;
  const elapsed = (serverNow - Date.parse(snapshot.generatedAt)) / 1000;

  function confirmEnd() {
    const row = ending;
    if (!row?.attemptId) return;
    startTransition(async () => {
      const result = await endMockSectionAction(row.attemptId!);
      if (result.success) toast.success(`${row.studentName}: ${result.ended.toLowerCase()} ended.`);
      else toast.error(result.error);
      setEnding(null);
      await refresh();
    });
  }

  const needle = query.trim().toLowerCase();
  const visibleRows = needle ? snapshot.rows.filter((row) => [row.studentName, row.studentEmail, row.accessCode ?? ""].some((value) => value.toLowerCase().includes(needle))) : snapshot.rows;
  const live = snapshot.rows.filter((row) => row.canEnd).length;

  return (
    <div className="space-y-4" data-testid="mock-monitor">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          Mock
          <select
            className="border-input bg-background h-9 rounded-lg border px-2 text-sm text-foreground"
            value={mockId ?? ""}
            onChange={(event) => setMockId(event.target.value || null)}
            data-testid="monitor-mock-filter"
          >
            <option value="">All mocks</option>
            {snapshot.mocks.map((mock) => (
              <option key={mock.id} value={mock.id}>
                {mock.title}
              </option>
            ))}
          </select>
        </label>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Student or access code"
          aria-label="Filter by student or access code"
          className="border-input bg-background h-9 w-52 rounded-lg border px-3 text-sm"
          data-testid="monitor-filter"
        />
        <p className="text-muted-foreground text-sm" data-testid="monitor-summary">
          {live} {live === 1 ? "student" : "students"} sitting now · {visibleRows.length}{needle ? ` of ${snapshot.rows.length}` : ""} in the list
        </p>
        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-destructive text-xs" role="alert">{error}</span>}
          <span className="text-muted-foreground text-xs" data-testid="monitor-updated">Updated {ago(Math.max(0, elapsed))} · refreshes every {POLL_MS / 1000} s</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh now">
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Refresh
          </Button>
        </div>
      </div>

      {visibleRows.length === 0 ? (
        <p className="text-muted-foreground rounded-2xl border border-dashed px-4 py-10 text-center text-sm" data-testid="monitor-empty">
          {needle ? "No student or access code matches that." : "Nobody is sitting a Full Mock right now. Students appear here as soon as they start with an access code."}
        </p>
      ) : (
        <Table data-testid="monitor-table">
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Mock</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Time left</TableHead>
              <TableHead>Last saved</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => {
              const left = row.secondsLeft != null ? Math.max(0, row.secondsLeft - elapsed) : null;
              const autoIn = row.autoStartInSeconds != null ? Math.max(0, row.autoStartInSeconds - elapsed) : null;
              const savedAgo = row.lastActivityAt ? Math.max(0, (serverNow - Date.parse(row.lastActivityAt)) / 1000) : null;
              return (
                <TableRow key={row.key} data-testid="monitor-row" data-attempt-id={row.attemptId ?? ""} data-status={row.status} data-student={row.studentEmail}>
                  <TableCell>
                    <p className="font-medium">{row.studentName}</p>
                    <p className="text-muted-foreground text-xs">{row.studentEmail}</p>
                  </TableCell>
                  <TableCell>
                    <p className="max-w-[16rem] truncate">{row.mockTitle}</p>
                    {row.accessCode && <p className="text-muted-foreground font-mono text-xs">{row.accessCode}</p>}
                  </TableCell>
                  <TableCell data-testid="monitor-section">{row.section ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[row.status]} data-testid="monitor-status">
                      {STATUS_LABEL[row.status]}
                    </Badge>
                    {row.detail && <p className="text-muted-foreground mt-1 max-w-[16rem] text-xs" data-testid="monitor-detail">{row.detail}</p>}
                  </TableCell>
                  <TableCell className="tabular-nums" data-testid="monitor-answered">
                    {row.answered != null && row.total != null ? `${row.answered} / ${row.total} answered` : row.words != null ? `${row.words} ${row.words === 1 ? "word" : "words"}` : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums" data-testid="monitor-time-left">
                    {left != null ? clock(left) : autoIn != null ? <span className="text-muted-foreground text-xs">starts by itself in {clock(autoIn)}</span> : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm" data-testid="monitor-last-activity">
                    {savedAgo != null ? ago(savedAgo) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.canEnd && (
                      <Button type="button" variant="outline" size="sm" onClick={() => setEnding(row)} data-testid="monitor-end-button">
                        End section
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={ending != null} onOpenChange={(open) => !open && !pending && setEnding(null)}>
        <DialogContent data-testid="monitor-confirm-dialog">
          <DialogHeader>
            <DialogTitle>End {ending?.section ?? "the"} section now?</DialogTitle>
            <DialogDescription>
              {ending?.studentName}&apos;s {ending?.section?.toLowerCase()} section will be handed in immediately. What they have saved so far is scored; nothing they have not saved counts. This cannot be undone, and the student moves on to the next screen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" onClick={confirmEnd} disabled={pending} data-testid="monitor-confirm-end">
              {pending && <Loader2 className="size-4 animate-spin" />} End section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
