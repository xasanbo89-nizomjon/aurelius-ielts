import Link from "next/link";
import { GitBranch } from "lucide-react";

import type { TestVersionInfo } from "@/lib/exam/test-versions";
import { Badge } from "@/components/ui/badge";

const statusBadge = (isPublished: boolean) => <Badge variant={isPublished ? "success" : "outline"}>{isPublished ? "Published" : "Draft"}</Badge>;

/**
 * Where this test sits among its versions and what still uses it. A new version never takes over a Full Mock, an assignment or an access code by itself:
 * those keep using the test they were set up with until a teacher picks the new one in the Full Mock editor.
 */
export function TestVersionsPanel({ info }: { info: TestVersionInfo }) {
  const hasContent = info.versionOf || info.newerVersions.length > 0 || info.fullMocks.length > 0 || info.assignments > 0;
  if (!hasContent) return null;

  return (
    <div className="border-border/70 space-y-2 rounded-2xl border p-4 text-sm" data-testid="test-versions">
      <p className="flex items-center gap-2 font-medium">
        <GitBranch className="text-muted-foreground size-4" /> Versions and where this test is used
      </p>
      {info.versionOf && (
        <p className="text-muted-foreground">
          A new version of{" "}
          <Link href={`/teacher/tests/${info.versionOf.id}`} className="text-foreground underline-offset-4 hover:underline">
            {info.versionOf.title}
          </Link>{" "}
          {statusBadge(info.versionOf.isPublished)}. Full Mocks and assignments that use that test still use it.
        </p>
      )}
      {info.newerVersions.length > 0 && (
        <div className="text-muted-foreground space-y-1">
          <p>New versions of this test:</p>
          <ul className="space-y-1">
            {info.newerVersions.map((version) => (
              <li key={version.id} className="flex items-center gap-2">
                <Link href={`/teacher/tests/${version.id}`} className="text-foreground underline-offset-4 hover:underline">
                  {version.title}
                </Link>
                {statusBadge(version.isPublished)}
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
          {info.assignments > 0 && `${info.assignments} assignment${info.assignments === 1 ? "" : "s"}`}. To switch a Full Mock to another version, pick it in that Full Mock&apos;s editor.
        </p>
      )}
    </div>
  );
}
