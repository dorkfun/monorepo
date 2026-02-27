import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const root = path.resolve(__dirname, "../..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@dorkfun/game-ui": path.join(root, "packages/game-ui/src/index.ts"),
      "@dorkfun/engine": path.join(root, "packages/engine/src/index.ts"),
      "@dorkfun/core": path.join(root, "packages/core/src/index.ts"),
      "@dorkfun/game-tictactoe": path.join(root, "packages/games/tictactoe/src/index.ts"),
      "@dorkfun/game-chess": path.join(root, "packages/games/chess/src/index.ts"),
      "@dorkfun/game-sudoku": path.join(root, "packages/games/sudoku/src/index.ts"),
      "@dorkfun/game-connectfour": path.join(root, "packages/games/connectfour/src/index.ts"),
      "@dorkfun/game-checkers": path.join(root, "packages/games/checkers/src/index.ts"),
      "@dorkfun/game-othello": path.join(root, "packages/games/othello/src/index.ts"),
      "@dorkfun/game-hex": path.join(root, "packages/games/hex/src/index.ts"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8080",
        ws: true,
      },
    },
  },
});
