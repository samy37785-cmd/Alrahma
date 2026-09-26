import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PRERENDER_MANIFEST, canonicalUrlFor } from "./prerender-routes.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = join(directory, "..");

// Single source of truth: only the (route, locale) pairs that are actually
// published and prerendered (PRERENDER_MANIFEST) go in the sitemap. This
// keeps the sitemap and the prerender output from ever drifting apart again
// — no separate route list is maintained here.
const publishedEntries = PRERENDER_MANIFEST.filter((entry) => entry.status === "published");

const priorityFor = (route) => {
  if (route === "/") return "1.0";
  if (route.startsWith("/courses")) return "0.9";
  if (route.startsWith("/tools")) return "0.85";
  if (route.startsWith("/academy")) return "0.8";
  if (route.startsWith("/resources")) return "0.8";
  return "0.8";
};

const body = publishedEntries
  .map((entry) => {
    const location = canonicalUrlFor(entry);
    return [
      "  <url>",
      `    <loc>${location}</loc>`,
      `    <changefreq>${entry.route === "/" ? "weekly" : "monthly"}</changefreq>`,
      `    <priority>${priorityFor(entry.route)}</priority>`,
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
console.log(`[sitemap] generated ${publishedEntries.length} URLs → public/sitemap.xml`);