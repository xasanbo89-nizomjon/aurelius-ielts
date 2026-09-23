"use client";

import dynamic from "next/dynamic";

// ssr: false is only valid from within a Client Component — this wrapper
// exists solely so the Server Component article page can lazy-load the
// player (browser Audio API, real client bundle weight) without paying for
// it on articles that have no audio at all.
const ArticleAudioPlayer = dynamic(
  () => import("@/components/student/article-audio-player").then((mod) => mod.ArticleAudioPlayer),
  { ssr: false }
);

export { ArticleAudioPlayer };
