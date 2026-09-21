import type { Metadata } from "next";

import { requireTeacherProfile } from "@/lib/session";
import { listBandRanges } from "@/lib/analytics/band-conversion-management";
import { PageHeader } from "@/components/dashboard/page-header";
import { BandScaleEditor } from "@/components/teacher/band-scale-editor";

export const metadata: Metadata = { title: "Band Conversion" };

export default async function BandConversionPage() {
  const { profile } = await requireTeacherProfile();
  const ranges = await listBandRanges(profile.id);

  const readingRanges = ranges.filter((r) => r.skill === "READING");
  const listeningRanges = ranges.filter((r) => r.skill === "LISTENING");

  return (
    <>
      <PageHeader
        title="Band Conversion"
        description="Raw-score-to-band lookup tables used to estimate a band the moment a student submits a test. This is a conversion table you control — not an AI estimate."
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <BandScaleEditor skill="READING" ranges={readingRanges} />
        <BandScaleEditor skill="LISTENING" ranges={listeningRanges} />
      </div>
    </>
  );
}
