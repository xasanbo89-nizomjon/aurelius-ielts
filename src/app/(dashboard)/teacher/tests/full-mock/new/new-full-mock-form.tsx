"use client";

import { useRouter } from "next/navigation";

import { BasicsStep } from "@/components/teacher/full-mock/basics-step";

export function NewFullMockForm() {
  const router = useRouter();
  return <BasicsStep onCreated={(id) => router.push(`/teacher/tests/full-mock/${id}`)} />;
}
