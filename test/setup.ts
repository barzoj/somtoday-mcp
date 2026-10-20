const BLOCKED =
  /inloggen\.somtoday\.nl|api\.somtoday\.nl|servers\.somtoday\.nl/;

const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (BLOCKED.test(url)) {
    throw new Error(`Network forbidden in tests: ${url}`);
  }
  return originalFetch(input, init);
};
