// A small in-memory log of what the extension did on this page, for troubleshooting.
// Lines also go to the console with a [ustautr] prefix. "Copy diagnostics" in the panel copies them.
// Keep entries about *shape* (statuses, field names, counts), not personal data.

const MAX_ENTRIES = 200;
const entries: string[] = [];

export function diag(message: string, details?: unknown): void {
  const time = new Date().toISOString().slice(11, 23);
  entries.push(details === undefined ? `${time} ${message}` : `${time} ${message} ${describe(details)}`);
  if (entries.length > MAX_ENTRIES) entries.shift();
  if (details === undefined) console.info('[ustautr]', message);
  else console.info('[ustautr]', message, details);
}

/** The report the user can paste: extension version, page, browser, then the log. */
export function diagnosticsReport(): string {
  const version = safe(() => browser.runtime.getManifest().version) ?? 'unknown';
  return [`USTA ⇄ UTR ${version}`, `Page: ${location.href}`, `Browser: ${navigator.userAgent}`, '', ...entries].join('\n');
}

/** Field names of an object, to describe an API response without its values. */
export function shapeOf(value: unknown): unknown {
  if (Array.isArray(value)) return { array: value.length, first: value.length ? shapeOf(value[0]) : undefined };
  if (value && typeof value === 'object') return Object.keys(value);
  return typeof value;
}

function describe(details: unknown): string {
  if (details instanceof Error) return `${details.name}: ${details.message}`;
  return safe(() => JSON.stringify(details)) ?? String(details);
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
