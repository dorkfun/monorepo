import { defineConfig } from "tsup";
import path from "path";
import fs from "fs";
import type { Plugin } from "esbuild";

const root = path.resolve("../..");

// Resolve @dorkfun/* imports to TypeScript source instead of compiled dist/
// (workspace packages compile to CJS, which breaks ESM bundling)
const resolveWorkspaceSource: Plugin = {
  name: "resolve-workspace-source",
  setup(build) {
    build.onResolve({ filter: /^@dorkfun\// }, (args) => {
      const name = args.path.replace("@dorkfun/", "");

      // Try packages/{name}/src/index.ts
      let srcPath = path.resolve(root, `packages/${name}/src/index.ts`);
      if (fs.existsSync(srcPath)) {
        return { path: srcPath };
      }

      // Try packages/games/{gameName}/src/index.ts (e.g. @dorkfun/game-chess)
      if (name.startsWith("game-")) {
        const gameName = name.replace("game-", "");
        srcPath = path.resolve(root, `packages/games/${gameName}/src/index.ts`);
        if (fs.existsSync(srcPath)) {
          return { path: srcPath };
        }
      }

      return undefined;
    });

    // Stub out @dorkfun/core's database barrel export — it pulls in
    // kysely, pg, and ioredis which the CLI never uses.
    const coreSrcDir = path.resolve(root, "packages/core/src");
    build.onResolve({ filter: /^\.\/database$/ }, (args) => {
      if (args.importer.startsWith(coreSrcDir)) {
        return { path: "stub:database", namespace: "stub" };
      }
      return undefined;
    });

    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "export {};",
      loader: "js",
    }));
  },
};

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  platform: "node",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: false,

  // Bundle all workspace packages into the output
  noExternal: [/^@dorkfun\//],

  banner: {
    js: "#!/usr/bin/env node",
  },

  esbuildOptions(options) {
    options.jsx = "automatic";
  },

  esbuildPlugins: [resolveWorkspaceSource],
});
