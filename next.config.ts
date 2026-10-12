import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local ML runtimes (embeddings + cross-encoder reranker) must not be bundled.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
};

export default nextConfig;
