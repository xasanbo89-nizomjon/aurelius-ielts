"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { FullMockCompleteness, FullMockTestForEdit, PickableMockTest } from "@/lib/full-mock-tests";
import { BasicsStep } from "@/components/teacher/full-mock/basics-step";
import { SkillSectionStep } from "@/components/teacher/full-mock/skill-section-step";
import { WritingStep } from "@/components/teacher/full-mock/writing-step";
import { SpeakingStep } from "@/components/teacher/full-mock/speaking-step";
import { ReviewStep } from "@/components/teacher/full-mock/review-step";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STEPS = [
  { value: "1", label: "Basics" },
  { value: "2", label: "Reading" },
  { value: "3", label: "Listening" },
  { value: "4", label: "Writing" },
  { value: "5", label: "Speaking" },
  { value: "6", label: "Review" },
] as const;

export function FullMockWizard({
  test,
  pickableReading,
  pickableListening,
  completeness,
}: {
  test: FullMockTestForEdit;
  pickableReading: PickableMockTest[];
  pickableListening: PickableMockTest[];
  completeness: FullMockCompleteness;
}) {
  const router = useRouter();
  const [step, setStep] = useState("1");

  function refreshAndAdvance(next: string) {
    router.refresh();
    setStep(next);
  }

  return (
    <Tabs value={step} onValueChange={setStep}>
      <TabsList className="flex-wrap">
        {STEPS.map((s) => (
          <TabsTrigger key={s.value} value={s.value}>
            {s.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="1">
        <BasicsStep
          fullMockTestId={test.id}
          initial={{
            title: test.title,
            description: test.description,
            coverImagePath: test.coverImagePath,
            estimatedBandMin: test.estimatedBandMin,
            estimatedBandMax: test.estimatedBandMax,
          }}
          onSaved={() => refreshAndAdvance("2")}
        />
      </TabsContent>

      <TabsContent value="2">
        <SkillSectionStep
          fullMockTestId={test.id}
          skill="READING"
          options={pickableReading}
          selectedMockTestId={test.readingSections[0]?.mockTest.id ?? null}
          onSaved={() => refreshAndAdvance("3")}
        />
      </TabsContent>

      <TabsContent value="3">
        <SkillSectionStep
          fullMockTestId={test.id}
          skill="LISTENING"
          options={pickableListening}
          selectedMockTestId={test.listeningSections[0]?.mockTest.id ?? null}
          onSaved={() => refreshAndAdvance("4")}
        />
      </TabsContent>

      <TabsContent value="4">
        <WritingStep
          fullMockTestId={test.id}
          sections={test.writingSections}
          onSaved={() => router.refresh()}
          onContinue={() => setStep("5")}
        />
      </TabsContent>

      <TabsContent value="5">
        <SpeakingStep
          fullMockTestId={test.id}
          sections={test.speakingSections}
          onSaved={() => router.refresh()}
          onContinue={() => setStep("6")}
        />
      </TabsContent>

      <TabsContent value="6">
        <ReviewStep fullMockTestId={test.id} title={test.title} status={test.status} completeness={completeness} />
      </TabsContent>
    </Tabs>
  );
}
