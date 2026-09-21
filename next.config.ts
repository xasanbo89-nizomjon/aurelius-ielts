import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
