-- Backfill: assign every currently-unassigned student to the root teacher,
-- matching the new auto-assign-at-registration default. Root can still
-- manually reassign any student afterward via Teacher Management. A no-op
-- if the root teacher's own TeacherProfile doesn't exist yet (fresh install
-- before its first boot) or if there are no unassigned students.
UPDATE "student_profiles"
SET "teacherId" = (
  SELECT tp.id
  FROM "teacher_profiles" tp
  JOIN "users" u ON u.id = tp."userId"
  WHERE u.email = 'axiy3735@gmail.com'
  LIMIT 1
)
WHERE "teacherId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "teacher_profiles" tp
    JOIN "users" u ON u.id = tp."userId"
    WHERE u.email = 'axiy3735@gmail.com'
  );
