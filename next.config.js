/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emits a minimal, self-contained `.next/standalone` build (only the
  // production node_modules a request actually needs) — this is what the
  // Docker "runner" stage copies, so the final image doesn't carry the
  // whole node_modules tree or the Next.js build toolchain.
  output: "standalone",
  // react-konva/konva rely on the `canvas` package for some optional
  // server-side code paths that we never actually hit (we render
  // client-side only). This keeps Next's server bundler from trying
  // to resolve that native dependency during build.
  webpack: (config) => {
    config.externals = [...(config.externals || []), { canvas: "canvas" }];
    return config;
  },
};

module.exports = nextConfig;
