import { redirect } from "next/navigation";

/** Phase R - the Subscription page was folded into Premium. The old address (and the ?upgrade=1 links saved in bookmarks) go there. */
export default async function StudentSubscriptionPage({ searchParams }: { searchParams: Promise<{ upgrade?: string }> }) {
  const { upgrade } = await searchParams;
  redirect(upgrade ? "/student/premium?upgrade=1" : "/student/premium");
}
