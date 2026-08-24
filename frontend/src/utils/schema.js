// Pure, side-effect-free JSON-LD builders shared between the page component
// that renders the content and the test that verifies the schema still
// matches it. Keeping this logic in one place (rather than duplicating the
// mapping in a test) means a future edit to the shape can't silently drift
// between what's rendered and what's declared as structured data.

export function buildFaqPageSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}
