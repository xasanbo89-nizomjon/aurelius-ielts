"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2 } from "lucide-react";

import { addSpeakingAudioCommentAction, deleteSpeakingAudioCommentAction } from "@/actions/speaking-audio.actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { dateTimeText } from "@/lib/speaking-audio/format";

export type CommentView = { id: string; body: string; createdAtIso: string; authorName: string | null; authorId: string };

/**
 * Phase Q-B - a teacher's comments under a student's recorded practice: the student sees them under the AI feedback. A teacher can remove their own comment (a Root
 * Teacher any); the server checks that again.
 */
export function TeacherComments({ practiceId, comments, viewerId, isRoot }: { practiceId: string; comments: CommentView[]; viewerId: string; isRoot: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await addSpeakingAudioCommentAction(practiceId, text);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setText("");
        router.refresh();
      } catch {
        setError("Could not reach the server. Try again.");
      }
    });
  }

  function remove(commentId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteSpeakingAudioCommentAction(commentId);
        if (!result.success) setError(result.error);
        else router.refresh();
      } catch {
        setError("Could not reach the server. Try again.");
      }
    });
  }

  return (
    <Card data-testid="teacher-comments">
      <CardContent className="space-y-4 py-5">
        <h2 className="font-display text-lg font-medium">Comments for the student</h2>
        {comments.length > 0 && (
          <ul className="space-y-3">
            {comments.map((comment) => (
              <li key={comment.id} className="border-border flex items-start justify-between gap-3 rounded-xl border p-3 text-sm" data-testid="comment">
                <div>
                  <p className="whitespace-pre-line">{comment.body}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {comment.authorName ?? "Teacher"} - {dateTimeText(comment.createdAtIso)}
                  </p>
                </div>
                {(isRoot || comment.authorId === viewerId) && (
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove comment" onClick={() => remove(comment.id)} disabled={pending} data-testid="comment-delete">
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2">
          <Textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} rows={3} placeholder="What should this student work on? The student sees your comment under the AI feedback." data-testid="comment-text" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">{text.length} / 2000</p>
            <Button onClick={send} disabled={pending || text.trim().length === 0} data-testid="comment-send">
              <Send className="size-4" /> Add comment
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
