import type { NextConfig } from "next";
import { join } from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: join(__dirname, "../.."),
  },
};

export default nextConfig;
