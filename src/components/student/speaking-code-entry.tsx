"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";

import { findSpeakingTaskByCodeAction } from "@/actions/speaking.actions";
import type { SpeakingTaskForStudent } from "@/lib/speaking";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SpeakingRecorder } from "@/components/student/speaking-recorder";

export function SpeakingCodeEntry() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState<SpeakingTaskForStudent | null>(null);

  async function handleFind(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError(null);
    const result = await findSpeakingTaskByCodeAction(code);
    setLoading(false);

    if (!result.success) {
      setError(result.error);
      setTask(null);
      return;
    }
    setTask(result.task);
  }

  if (task) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Part {task.part}</Badge>
          </div>
          <CardTitle>{task.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm whitespace-pre-wrap">{task.prompt}</p>
          <SpeakingRecorder
            taskId={task.id}
            onSubmitted={() => {
              setTask(null);
              setCode("");
              router.refresh();
            }}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Enter a speaking code</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleFind} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="speaking-code">Code from your teacher</Label>
            <Input
              id="speaking-code"
              placeholder="SPK-7F2Q"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="font-mono uppercase"
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Find task
          </Button>
        </form>
        {error && <p className="text-destructive mt-2 text-xs">{error}</p>}
      </CardContent>
    </Card>
  );
}
