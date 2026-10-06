import Link from "next/link";
import { GitBranch } from "lucide-react";

import type { TestVersionInfo } from "@/lib/exam/test-versions";
import { Badge } from "@/components/ui/badge";

const statusBadge = (test: { isPublished: boolean; isArchived: boolean }) => (
  <Badge variant={test.isPublished && !test.isArchived ? "success" : "outline"}>{test.isArchived ? "Archived" : test.isPublished ? "Published" : "Draft"}</Badge>
);

/**
 * Where this test sits among its versions and what still uses it. Versions keep the title of the test they replace (students never see a version
 * label); teachers tell them apart as v1, v2, v3. A new version never takes over a Full Mock or an assignment by itself: those keep using the test they
 * were set up with until a teacher picks "Use newest version" in the Full Mock editor or on the Assignments page, or archives the old one when publishing.
 */
export function TestVersionsPanel({ info }: { info: TestVersionInfo }) {
  const hasContent = info.versionOf || info.newerVersions.length > 0 || info.fullMocks.length > 0 || info.assignments > 0;
  if (!hasContent) return null;

  return (
    <div className="border-border/70 space-y-2 rounded-2xl border p-4 text-sm" data-testid="test-versions">
      <p className="flex items-center gap-2 font-medium">
        <GitBranch className="text-muted-foreground size-4" /> Versions and where this test is used
        <Badge variant="outline">This is v{info.versionNumber}</Badge>
      </p>
      {info.versionOf && (
        <p className="text-muted-foreground">
          A new version of{" "}
          <Link href={`/teacher/tests/${info.versionOf.id}`} className="text-foreground underline-offset-4 hover:underline">
            v{info.versionOf.versionNumber} “{info.versionOf.title}”
          </Link>{" "}
          {statusBadge(info.versionOf)}. Full Mocks and assignments that use that one still use it until you switch them.
        </p>
      )}
      {info.newerVersions.length > 0 && (
        <div className="text-muted-foreground space-y-1">
          <p>New versions of this test:</p>
          <ul className="space-y-1">
            {info.newerVersions.map((version) => (
              <li key={version.id} className="flex items-center gap-2">
                <Link href={`/teacher/tests/${version.id}`} className="text-foreground underline-offset-4 hover:underline">
                  v{version.versionNumber} “{version.title}”
                </Link>
                {statusBadge(version)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(info.fullMocks.length > 0 || info.assignments > 0) && (
        <p className="text-muted-foreground">
          Still uses this test:{" "}
          {info.fullMocks.map((mock, index) => (
            <span key={mock.id}>
              {index > 0 && ", "}
              <Link href={`/teacher/tests/full-mock/${mock.id}`} className="text-foreground underline-offset-4 hover:underline">
                {mock.title}
              </Link>
            </span>
          ))}
          {info.fullMocks.length > 0 && info.assignments > 0 && " and "}
          {info.assignments > 0 && `${info.assignments} assignment${info.assignments === 1 ? "" : "s"}`}. A Full Mock switches to a newer version with “Use newest version” in its Reading / Listening step, an assignment on the Assignments page; access codes follow their Full Mock.
        </p>
      )}
    </div>
  );
}
