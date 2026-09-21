"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Scale, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createBandRangeAction,
  deleteBandRangeAction,
  loadStandardScaleAction,
  updateBandRangeAction,
} from "@/actions/band-conversion.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/empty-state";

export type BandRange = { id: string; minScore: number; maxScore: number; band: number };

export function BandScaleEditor({
  skill,
  ranges,
}: {
  skill: "READING" | "LISTENING";
  ranges: BandRange[];
}) {
  const [pending, startTransition] = useTransition();
  const [newRange, setNewRange] = useState({ minScore: "", maxScore: "", band: "" });

  function handleAdd() {
    if (!newRange.minScore || !newRange.maxScore || !newRange.band) {
      toast.error("Fill in all three fields.");
      return;
    }
    startTransition(async () => {
      const result = await createBandRangeAction({
        skill,
        minScore: Number(newRange.minScore),
        maxScore: Number(newRange.maxScore),
        band: Number(newRange.band),
      });
      if (!result.success) toast.error(result.error);
      else setNewRange({ minScore: "", maxScore: "", band: "" });
    });
  }

  function handleUpdate(id: string, field: keyof Omit<BandRange, "id">, value: string, current: BandRange) {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return;
    const next = { minScore: current.minScore, maxScore: current.maxScore, band: current.band, [field]: numeric };
    startTransition(async () => {
      const result = await updateBandRangeAction(id, next);
      if (!result.success) toast.error(result.error);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteBandRangeAction(id);
      if (!result.success) toast.error(result.error);
    });
  }

  function handleLoadStandard() {
    startTransition(async () => {
      const result = await loadStandardScaleAction(skill);
      if (!result.success) toast.error(result.error);
      else toast.success("Standard scale loaded — feel free to edit it.");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg font-medium capitalize">{skill.toLowerCase()}</h3>
        <Button variant="outline" size="sm" onClick={handleLoadStandard} disabled={pending}>
          <Sparkles className="size-4" /> Load standard IELTS scale
        </Button>
      </div>

      {ranges.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="No conversion table yet"
          description="Add ranges manually below, or load the standard IELTS scale as a starting point."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Min score</TableHead>
              <TableHead>Max score</TableHead>
              <TableHead>Band</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranges.map((range) => (
              <TableRow key={range.id}>
                <TableCell>
                  <Input
                    type="number"
                    defaultValue={range.minScore}
                    className="w-20"
                    aria-label={`Minimum score for band ${range.band}`}
                    onBlur={(event) => handleUpdate(range.id, "minScore", event.target.value, range)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    defaultValue={range.maxScore}
                    className="w-20"
                    aria-label={`Maximum score for band ${range.band}`}
                    onBlur={(event) => handleUpdate(range.id, "maxScore", event.target.value, range)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step={0.5}
                    defaultValue={range.band}
                    className="w-20"
                    aria-label={`Band score for ${range.minScore} to ${range.maxScore}`}
                    onBlur={(event) => handleUpdate(range.id, "band", event.target.value, range)}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(range.id)}
                    disabled={pending}
                    aria-label={`Delete range ${range.minScore}-${range.maxScore}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${skill}-min`} className="text-muted-foreground text-xs font-normal">
            Min
          </Label>
          <Input
            id={`${skill}-min`}
            type="number"
            className="w-20"
            value={newRange.minScore}
            onChange={(event) => setNewRange((r) => ({ ...r, minScore: event.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${skill}-max`} className="text-muted-foreground text-xs font-normal">
            Max
          </Label>
          <Input
            id={`${skill}-max`}
            type="number"
            className="w-20"
            value={newRange.maxScore}
            onChange={(event) => setNewRange((r) => ({ ...r, maxScore: event.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${skill}-band`} className="text-muted-foreground text-xs font-normal">
            Band
          </Label>
          <Input
            id={`${skill}-band`}
            type="number"
            step={0.5}
            className="w-20"
            value={newRange.band}
            onChange={(event) => setNewRange((r) => ({ ...r, band: event.target.value }))}
          />
        </div>
        <Button size="sm" onClick={handleAdd} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add range
        </Button>
      </div>
    </div>
  );
}
