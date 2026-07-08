import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const config = {
  plugins: {
    "@tailwindcss/postcss": {
      // Tailwind v4 resolves packages relative to its `base`.
      // Pin it to the frontend folder so repo-root launchers still work.
      base: configDir,
    },
  },
};

export default config;
