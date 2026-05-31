// packages/realestate-ingest/src/isir/extract.ts
//
// Step 3 of the ISIR Tier-B ingester (see
// docs/superpowers/plans/2026-05-31-isir-tier-b.md, NARROWED v1).
//
// PURE document-text + okres logic. The runtime text-extraction hybrid
// (pdftotext → tesseract -l ces → optional Mistral OCR) lives elsewhere and is
// injected; this module only reasons over already-extracted text strings, so it
// is fully unit-testable against the committed fixtures/isir/*.txt files with no
// network / external binaries.
//
// Four pure functions:
//   - looksLikeMojibake(text)        — decide pdftotext-vs-OCR at runtime
//   - passesContentGate(text)        — drop movables / negative-cadastre docs
//   - extractKatastrAndObec(text)    — pull k.ú. + obec names from gated text
//   - resolveOkresSlug({katastr,obec}) — map to an okresSlug (k.ú. preferred)
import { slugifyCs } from '@czagents/shared';
import { KATASTR_OKRES, OBEC_OKRES } from '../data/cz-katastr-okres.js';

/**
 * Heuristic mojibake detector for the runtime extractor's pdftotext-vs-OCR
 * branch. Identity-H PDFs without a ToUnicode CMap make pdftotext emit glyph
 * soup (control chars, ligature/symbol codepoints) with almost no real Czech or
 * latin letters. We compute the ratio of letters (a–z, A–Z, plus the Czech
 * diacritic set) to total non-space characters; a low ratio ⇒ mojibake ⇒ the
 * caller should fall back to OCR.
 *
 * Clean Czech text sits well above the threshold; garbled dumps fall far below.
 */
export function looksLikeMojibake(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 20) {
    // Too little signal to judge; treat empty/near-empty pdftotext output as
    // mojibake so the caller tries OCR.
    return true;
  }
  // Letters: ASCII a–z/A–Z + the full Czech diacritic set.
  const letters = compact.match(
    /[a-zA-ZáčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/g,
  );
  const ratio = (letters?.length ?? 0) / compact.length;
  return ratio < 0.5;
}

// Tokens that mark a document as a real cadastre/real-estate listing. Required
// before we treat an event as a lead; movables auctions and negative cadastre
// extracts lack them. Matched case-insensitively and whitespace-tolerantly
// (pdftotext/OCR wrap lines mid-phrase). "LV" is matched as a standalone token
// to avoid false hits inside words.
const GATE_PATTERNS: readonly RegExp[] = [
  /katastráln\w*\s+území/i,
  /\bobci\b/i,
  /parc\.\s*č\./i,
  /\bLV\b/,
];

/**
 * Content gate: require the document to actually describe a real-estate parcel.
 * NARROWED v1 demands the tokens `katastrální území` / `obci` / `parc. č.` / `LV`.
 * We require at least two distinct cadastre signals so a stray "obci" in prose
 * or an "LV" abbreviation does not admit a movables doc. doc-535 has all four;
 * doc-335 (sewing machines), doc-1081 (cooperative-share final report), and
 * doc-829 (negative cadastre) have none → dropped.
 */
export function passesContentGate(text: string): boolean {
  const hits = GATE_PATTERNS.reduce(
    (n, re) => n + (re.test(text) ? 1 : 0),
    0,
  );
  return hits >= 2;
}

export interface KatastrObec {
  katastr?: string;
  obec?: string;
}

// A proper-name token: starts with an uppercase (incl. Czech) letter, may
// contain further letters, digits, hyphens, and spaces (multi-word k.ú./obec
// names like "Nový Bohumín", "Moravská Ostrava"). Stops at a comma, semicolon,
// period, or end of clause. Whitespace (incl. newlines from line-wrapped PDF
// text) between the keyword and the name is collapsed.
//
// NOTE: do NOT apply the `i` flag to these regexes — JS case-folds the explicit
// `Á-Ž` / `á-ž` ranges under `i` in a way that breaks the character classes
// (the diacritic ranges stop matching). The keyword stems are written to match
// the real document casing directly, and the name classes spell out both cases.
const UPPER = 'A-ZÁ-Ža-ž'; // first char: any letter (some OCR lowercases initials)
const REST = 'A-Za-zÁ-Žá-ž0-9';
const NAME = `([${UPPER}][${REST}-]*(?:\\s+[${UPPER}0-9][${REST}-]*)*)`;

// "v katastrálním území <Name>" / "katastrální území <Name>".
const KATASTR_RE = new RegExp(`[Kk]atastráln\\S*\\s+území\\s+${NAME}`);
// "obci <Name>".
const OBEC_RE = new RegExp(`\\bobci\\s+${NAME}`);

/**
 * Extract the katastrální území and obec names from already-gated document text.
 * Tolerant of the line wrapping pdftotext/OCR introduce mid-phrase. Returns an
 * empty object when neither is present (e.g. a movables doc that slipped the
 * gate). Trailing punctuation is trimmed off the captured name.
 */
export function extractKatastrAndObec(text: string): KatastrObec {
  const out: KatastrObec = {};
  const k = KATASTR_RE.exec(text);
  if (k?.[1]) out.katastr = cleanName(k[1]);
  const o = OBEC_RE.exec(text);
  if (o?.[1]) out.obec = cleanName(o[1]);
  return out;
}

function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').replace(/[;,.\s]+$/, '').trim();
}

/**
 * Map an extracted location to an okresSlug. Katastrální území is preferred (k.ú.
 * names are unique in the RÚIAN dataset); obec is used only as a fallback and
 * only when unambiguous (OBEC_OKRES already omits multi-okres obec names). The
 * resolved okres NAME is slugified via slugifyCs. Unresolvable ⇒ null (the
 * caller logs and skips; never guesses).
 */
export function resolveOkresSlug(loc: KatastrObec): string | null {
  const okresName =
    (loc.katastr ? KATASTR_OKRES[loc.katastr] : undefined) ??
    (loc.obec ? OBEC_OKRES[loc.obec] : undefined);
  if (!okresName) return null;
  return slugifyCs(okresName);
}
