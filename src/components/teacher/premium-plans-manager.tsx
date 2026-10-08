"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { deletePremiumPlanAction, reorderPremiumPlansAction, savePremiumPlanAction, setPremiumPlanActiveAction } from "@/actions/premium-plans.actions";
import { formatPlanPrice, moveId, PLAN_BADGES, PLAN_CURRENCIES, type PlanCurrency } from "@/lib/premium-plan-rules";
import type { PlanForRoot } from "@/lib/premium-plan-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Draft = {
  id?: string;
  name: string;
  durationDays: string;
  price: string;
  currency: PlanCurrency;
  badge: string;
  features: string[];
  telegramLink: string;
  isActive: boolean;
};

const EMPTY: Draft = { name: "", durationDays: "30", price: "", currency: "USD", badge: "", features: [""], telegramLink: "", isActive: true };

const fromPlan = (plan: PlanForRoot): Draft => ({
  id: plan.id,
  name: plan.name,
  durationDays: String(plan.durationDays),
  price: String(plan.price),
  currency: plan.currency,
  badge: plan.badge ?? "",
  features: plan.features.length ? plan.features : [""],
  telegramLink: plan.telegramLink ?? "",
  isActive: plan.isActive,
});

const SELECT = "border-input bg-card h-11 w-full rounded-xl border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30";

function moveIndex(list: string[], index: number, direction: -1 | 1): string[] {
  const to = index + direction;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export function PremiumPlansManager({ plans }: { plans: PlanForRoot[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  async function run(key: string, work: () => Promise<{ success: boolean; error?: string }>, done?: string) {
    setBusy(key);
    const result = await work();
    setBusy(null);
    if (!result.success) {
      toast.error(result.error ?? "Something went wrong.");
      return false;
    }
    if (done) toast.success(done);
    router.refresh();
    return true;
  }

  const ids = plans.map((plan) => plan.id);

  function save() {
    if (!draft) return;
    startSaving(async () => {
      const ok = await run(
        "save",
        () =>
          savePremiumPlanAction({
            id: draft.id,
            name: draft.name,
            durationDays: draft.durationDays,
            price: draft.price,
            currency: draft.currency,
            badge: draft.badge,
            features: draft.features,
            telegramLink: draft.telegramLink,
            isActive: draft.isActive,
          }),
        "Plan saved."
      );
      if (ok) setDraft(null);
    });
  }

  const priceNumber = Number(draft?.price);
  const preview = draft && draft.price.trim() !== "" && Number.isFinite(priceNumber) ? formatPlanPrice(priceNumber, draft.currency) : "—";

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setDraft({ ...EMPTY })} data-testid="plan-add">
          <Plus className="size-4" /> Add plan
        </Button>
      </div>

      <div className="space-y-3">
        {plans.map((plan, index) => (
          <Card key={plan.id} className="gap-0 py-4" data-testid="plan-row" data-plan-name={plan.name}>
            <CardContent className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col">
                <Button size="icon" variant="ghost" className="size-7" aria-label="Move up" disabled={index === 0 || busy != null} onClick={() => run(`up-${plan.id}`, () => reorderPremiumPlansAction(moveId(ids, plan.id, -1)))}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" className="size-7" aria-label="Move down" disabled={index === plans.length - 1 || busy != null} onClick={() => run(`down-${plan.id}`, () => reorderPremiumPlansAction(moveId(ids, plan.id, 1)))}>
                  <ArrowDown className="size-4" />
                </Button>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{plan.name}</p>
                  {plan.badge && <Badge variant={plan.badge === "POPULAR" ? "accent" : "success"}>{plan.badge}</Badge>}
                  {!plan.isActive && <Badge variant="outline">Hidden</Badge>}
                </div>
                <p className="text-muted-foreground text-sm">
                  <span className="text-foreground font-medium" data-testid="plan-price">
                    {plan.priceLabel}
                  </span>{" "}
                  · {plan.durationLabel} · {plan.features.length} feature{plan.features.length === 1 ? "" : "s"} · {plan.requestCount} purchase request{plan.requestCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setDraft(fromPlan(plan))} data-testid="plan-edit">
                  <Pencil className="size-4" /> Edit
                </Button>
                <Button size="sm" variant="outline" disabled={busy != null} onClick={() => run(`vis-${plan.id}`, () => setPremiumPlanActiveAction(plan.id, !plan.isActive), plan.isActive ? "Plan hidden from students." : "Plan is on sale.")}>
                  {plan.isActive ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  {plan.isActive ? "Hide" : "Show"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Delete plan"
                  disabled={busy != null || plan.requestCount > 0}
                  title={plan.requestCount > 0 ? "A plan with purchase requests cannot be deleted - hide it instead." : "Delete this plan"}
                  onClick={() => {
                    if (window.confirm(`Delete "${plan.name}"? This cannot be undone.`)) void run(`del-${plan.id}`, () => deletePremiumPlanAction(plan.id), "Plan deleted.");
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {plans.length === 0 && <p className="text-muted-foreground text-sm">No plans yet. Students see no plan to buy until you add one.</p>}
      </div>

      <Dialog open={draft != null} onOpenChange={(open) => !open && !saving && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit plan" : "New plan"}</DialogTitle>
            <DialogDescription>Students see this plan on their Premium page. Changing a price does not change what earlier purchase requests recorded.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="plan-name">Name</Label>
                <Input id="plan-name" value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="plan-days">Duration (days)</Label>
                  <Input id="plan-days" inputMode="numeric" value={draft.durationDays} onChange={(e) => setDraft({ ...draft, durationDays: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-badge">Badge</Label>
                  <select id="plan-badge" className={SELECT} value={draft.badge} onChange={(e) => setDraft({ ...draft, badge: e.target.value })}>
                    <option value="">None</option>
                    {PLAN_BADGES.map((badge) => (
                      <option key={badge} value={badge}>
                        {badge}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-price">Price</Label>
                  <Input id="plan-price" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-currency">Currency</Label>
                  <select id="plan-currency" className={SELECT} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value as PlanCurrency })}>
                    {PLAN_CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-muted-foreground text-xs">
                Students will see: <span className="text-foreground font-medium">{preview}</span>
              </p>

              <div className="space-y-2">
                <Label>Features</Label>
                {draft.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-1.5">
                    <Input value={feature} maxLength={120} aria-label={`Feature ${index + 1}`} onChange={(e) => setDraft({ ...draft, features: draft.features.map((f, i) => (i === index ? e.target.value : f)) })} />
                    <Button type="button" size="icon" variant="ghost" aria-label="Move feature up" disabled={index === 0} onClick={() => setDraft({ ...draft, features: moveIndex(draft.features, index, -1) })}>
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Move feature down" disabled={index === draft.features.length - 1} onClick={() => setDraft({ ...draft, features: moveIndex(draft.features, index, 1) })}>
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Remove feature" onClick={() => setDraft({ ...draft, features: draft.features.filter((_, i) => i !== index) })}>
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={() => setDraft({ ...draft, features: [...draft.features, ""] })}>
                  <Plus className="size-4" /> Add feature
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="plan-link">Telegram buy link (optional)</Label>
                <Input id="plan-link" placeholder="https://t.me/username" value={draft.telegramLink} onChange={(e) => setDraft({ ...draft, telegramLink: e.target.value })} />
                <p className="text-muted-foreground text-xs">Left empty, the buy button uses the owner&apos;s Telegram username from the settings.</p>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> On sale (shown to students)
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving} data-testid="plan-save">
              {saving && <Loader2 className="size-4 animate-spin" />} Save plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
