-- CreateTable
CREATE TABLE "teacher_allowlist" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_allowlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teacher_allowlist_email_key" ON "teacher_allowlist"("email");

-- AddForeignKey
ALTER TABLE "teacher_allowlist" ADD CONSTRAINT "teacher_allowlist_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
