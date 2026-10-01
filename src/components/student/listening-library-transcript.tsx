"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ListeningLibraryTranscript({ transcript }: { transcript: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <FileText className="size-4" />
          {open ? "Hide Transcript" : "Show Transcript"}
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
        {open && <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{transcript}</p>}
      </CardContent>
    </Card>
  );
}
