-- Phase H: a student note can be attached to a highlight (passage or question text). Additive: every existing row keeps working with a null note.
ALTER TABLE "highlights" ADD COLUMN "note" TEXT;
ALTER TABLE "question_highlights" ADD COLUMN "note" TEXT;
