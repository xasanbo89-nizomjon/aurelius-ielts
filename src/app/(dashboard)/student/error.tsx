"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/dashboard/error-state";

export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="This page couldn't load"
      description="Something went wrong while loading your dashboard. Please try again."
      onRetry={reset}
    />
  );
}
