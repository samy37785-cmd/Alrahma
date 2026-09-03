import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { seoRoutes as routes } from "./seoRoutes.mjs";
import { site } from "../src/data/site.js";

const directory = dirname(fileURLToPath(import.meta.url));
const root = join(directory, "..");
const origin = site.origin;
const paths = [...new Set([...routes, "/it/", "/fr/"])];

const priorityFor = (route) => {
  if (route === "/") return "1.0";
  if (route.startsWith("/courses")) return "0.9";
  if (route.startsWith("/tools")) return "0.85";
  if (route.startsWith("/academy")) return "0.8";
  if (route.startsWith("/resources")) return "0.8";
  return "0.8";
};

const body = paths
  .map((route) => {
    const location = route === "/" ? `${origin}/` : `${origin}${route}`;
    return [
      "  <url>",
      `    <loc>${location}</loc>`,
      `    <changefreq>${route === "/" ? "weekly" : "monthly"}</changefreq>`,
      `    <priority>${priorityFor(route)}</priority>`,
      "  </url>",
    ].join("\n");
  })
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;

writeFileSync(join(root, "public", "sitemap.xml"), xml, "utf8");
console.log(`[sitemap] generated ${paths.length} URLs → public/sitemap.xml`);