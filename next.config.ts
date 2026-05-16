import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/uploads/:file",
          destination: "/api/uploads/:file",
        },
      ],
    };
  },
};

export default nextConfig;
