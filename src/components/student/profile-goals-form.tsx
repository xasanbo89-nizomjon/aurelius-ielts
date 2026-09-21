"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { updateStudentNameAction, updateStudentProfileAction } from "@/actions/profile.actions";
import { TARGET_BAND_OPTIONS } from "@/lib/validations/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ProfileGoalsForm({
  initialName,
  initialCountryGoal,
  initialUniversityGoal,
  initialPersonalGoal,
  initialTargetBand,
}: {
  initialName: string | null;
  initialCountryGoal: string | null;
  initialUniversityGoal: string | null;
  initialPersonalGoal: string | null;
  initialTargetBand: number | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const [countryGoal, setCountryGoal] = useState(initialCountryGoal ?? "");
  const [universityGoal, setUniversityGoal] = useState(initialUniversityGoal ?? "");
  const [personalGoal, setPersonalGoal] = useState(initialPersonalGoal ?? "");
  const [targetBand, setTargetBand] = useState(initialTargetBand != null ? String(initialTargetBand) : "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);

    if (name.trim() && name.trim() !== (initialName ?? "")) {
      const nameResult = await updateStudentNameAction(name);
      if (!nameResult.success) {
        toast.error(nameResult.error);
        setSaving(false);
        return;
      }
    }

    const result = await updateStudentProfileAction({
      countryGoal: countryGoal.trim() || undefined,
      universityGoal: universityGoal.trim() || undefined,
      personalGoal: personalGoal.trim() || undefined,
      targetBandScore: targetBand ? Number(targetBand) : undefined,
    });
    setSaving(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Profile updated.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="profile-name">Full Name</Label>
        <Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="profile-country">Country Goal</Label>
          <Input
            id="profile-country"
            value={countryGoal}
            onChange={(event) => setCountryGoal(event.target.value)}
            placeholder="e.g. United Kingdom"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-university">University Goal</Label>
          <Input
            id="profile-university"
            value={universityGoal}
            onChange={(event) => setUniversityGoal(event.target.value)}
            placeholder="e.g. King Saud University"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="profile-target-band">IELTS Target Band</Label>
          <Select value={targetBand} onValueChange={setTargetBand}>
            <SelectTrigger id="profile-target-band">
              <SelectValue placeholder="Choose a target band" />
            </SelectTrigger>
            <SelectContent>
              {TARGET_BAND_OPTIONS.map((band) => (
                <SelectItem key={band} value={String(band)}>
                  {band.toFixed(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-goal">Personal Goal</Label>
          <Input
            id="profile-goal"
            value={personalGoal}
            onChange={(event) => setPersonalGoal(event.target.value)}
            placeholder="e.g. Study Abroad"
          />
        </div>
      </div>

      <Button type="button" onClick={handleSave} disabled={saving}>
        {saving && <Loader2 className="size-4 animate-spin" />}
        Save Changes
      </Button>
    </div>
  );
}
