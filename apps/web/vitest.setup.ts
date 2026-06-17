import { afterEach } from "vitest";

// The app writes to window.history for shareable skill URLs (see use-skill-url).
// Tests in a file share one jsdom instance, so reset the URL after each test to
// keep navigation state from leaking between cases.
afterEach(() => {
  window.history.replaceState(null, "", "/");
});
