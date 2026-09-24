"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { createSubscriptionPlanSchema, type CreateSubscriptionPlanInput } from "@/lib/validations/subscription-plans";
import { createSubscriptionPlanAction } from "@/actions/subscription-plans.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function CreateSubscriptionPlanForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CreateSubscriptionPlanInput>({
    resolver: zodResolver(createSubscriptionPlanSchema),
    defaultValues: { interval: "MONTHLY" },
  });

  const interval = watch("interval");

  async function onSubmit(values: CreateSubscriptionPlanInput) {
    setSubmitting(true);
    const result = await createSubscriptionPlanAction(values);
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Plan created.");
    reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Create plan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a subscription plan</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="Premium Monthly" {...register("name")} />
            {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea id="description" rows={2} {...register("description")} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="price">Price (USD)</Label>
              <Input
                id="price"
                type="number"
                min={0}
                step={0.01}
                {...register("price", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
              />
              {errors.price && <p className="text-destructive text-xs">{errors.price.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="interval">Billing interval</Label>
              <Select value={interval} onValueChange={(value) => setValue("interval", value as CreateSubscriptionPlanInput["interval"])}>
                <SelectTrigger id="interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                  <SelectItem value="YEARLY">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Create plan
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
