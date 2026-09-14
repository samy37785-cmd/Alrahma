import { defineConfig, InputTransformerFn } from "orval";
import path from "path";

const root = path.resolve(__dirname, "..", "..");
const apiClientReactSrc = path.resolve(root, "lib", "api-client-react", "src");
const apiZodSrc = path.resolve(root, "lib", "api-zod", "src");

// Our exports make assumptions about the title of the API being "Api" (i.e. generated output is `api.ts`).
const titleTransformer: InputTransformerFn = (config) => {
  config.info ??= {};
  config.info.title = "Api";

  return config;
};

export default defineConfig({
  "api-client-react": {
    input: {
      target: "./openapi.yaml",
      override: {
        transformer: titleTransformer,
      },
    },
    output: {
      workspace: apiClientReactSrc,
      target: "generated",
      client: "react-query",
      mode: "split",
      baseUrl: "/api",
      clean: true,
      // STOP GATE C: this was `prettier: true` — a stale orval v6/v7 config
      // key. orval v8's actual output option is `formatter: "prettier"`
      // (an enum string: SupportedFormatter.PRETTIER/BIOME/OXFMT — see
      // node_modules/orval's runFormatter(), which switches on this exact
      // value); `prettier: true` isn't a recognized key at all, so it was
      // silently ignored and NO formatter ever ran on generated output —
      // root cause of the trailing-blank-line drift this repo's codegen
      // step used to paper over with a manual post-generation trim script
      // after every run. Fixing the key itself (not adding an external
      // normalization step) makes two consecutive `codegen` runs produce
      // byte-identical output on their own, using orval's own supported
      // mechanism (it imports this workspace's own `prettier` dependency
      // programmatically — see formatWithPrettier() — so this is
      // deterministic, not a PATH-dependent global-CLI fallback).
      formatter: "prettier",
      override: {
        fetch: {
          includeHttpResponseReturnType: false,
        },
        mutator: {
          path: path.resolve(apiClientReactSrc, "custom-fetch.ts"),
          name: "customFetch",
        },
      },
    },
  },
  zod: {
    input: {
      target: "./openapi.yaml",
      override: {
        transformer: titleTransformer,
      },
    },
    output: {
      workspace: apiZodSrc,
      client: "zod",
      target: "generated",
      schemas: { path: "generated/types", type: "typescript" },
      mode: "split",
      clean: true,
      // See the api-client-react output block's own comment above — same
      // stale-key fix, same root cause.
      formatter: "prettier",
      override: {
        zod: {
          coerce: {
            query: ['boolean', 'number', 'string'],
            param: ['boolean', 'number', 'string'],
            body: ['bigint', 'date'],
            response: ['bigint', 'date'],
          },
        },
        useDates: true,
        useBigInt: true,
      },
    },
  },
});
