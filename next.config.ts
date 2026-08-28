import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @xenova/transformers + onnxruntime-node have native dependencies (sharp, etc.)
  // that must not be bundled — load them as external packages at runtime.
  serverExternalPackages: [
    "@xenova/transformers",
    "onnxruntime-node",
    "sharp",
  ],
};

export default nextConfig;
