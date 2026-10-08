import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase L2 - PDFium (WebAssembly) draws the page of a PDF that becomes a Writing Task 1 picture. It finds its own .wasm file next to itself, so it must run
  // from node_modules as it is (not be bundled into the server code), and that file must travel with the serverless function.
  serverExternalPackages: ["@hyzyla/pdfium"],
  outputFileTracingIncludes: {
    "/teacher/**": ["./node_modules/@hyzyla/pdfium/dist/pdfium.wasm"],
  },
  // Phase R - the Subscription page was folded into Premium. Redirecting here (before any page renders) keeps old bookmarks and ?upgrade=1 links working
  // without a client-side redirect from inside the dashboard layout.
  async redirects() {
    return [{ source: "/student/subscription", destination: "/student/premium", permanent: false }];
  },
  experimental: {
    serverActions: {
      // Default is 1MB — raised so teachers can upload listening audio
      // (.mp3/.wav/.m4a) directly through a Server Action. Kept in sync
      // with MAX_AUDIO_FILE_SIZE_BYTES in src/lib/uploads/audio-constraints.ts.
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
