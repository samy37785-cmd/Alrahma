---
name: Fresh-browser verification
description: How to distinguish a stale preview browser from a current Vite runtime failure after dependency changes.
---

After installing or changing frontend dependencies, treat invalid-hook or old Vite dependency-hash errors from a reused screenshot context as potentially stale. Clear the Vite optimization cache, restart the web workflow, and verify in a brand-new browser context before changing application code.

**Why:** A reused screenshot context continued to display an old React dependency hash and error boundary after the restarted server was serving a new dependency graph; a fresh end-to-end browser context loaded the same routes successfully.

**How to apply:** When the screenshot stack references hashes that differ from the currently served transformed modules, use a fresh testing browser context for the authoritative check.