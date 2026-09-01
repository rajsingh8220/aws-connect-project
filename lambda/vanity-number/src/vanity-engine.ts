import {
  findWordMatches,
  normalizePhoneDigits,
  toSpeakablePhrase,
  type WordMatch,
} from './t9';
import { generateNameVanityCandidates, nameSimilarity } from './name-vanity';

export interface VanityCandidate {
  readonly display: string;
  readonly speak: string;
  readonly score: number;
}

function overlaps(a: WordMatch, b: WordMatch): boolean {
  return a.start < b.end && b.start < a.end;
}

function scoreCandidate(display: string, words: string[], firstName?: string): number {
  let score = words.length * 100;
  score += words.reduce((sum, word) => sum + word.length * 10, 0);

  const digitCount = (display.match(/\d/g) ?? []).length;
  score -= digitCount * 2;

  if (display.startsWith('1-')) {
    score += 15;
  }

  if (words.some((word) => word.length >= 4)) {
    score += 25;
  }

  if (firstName) {
    const alphaParts = display.split('-').filter((part) => /^[A-Z]+$/i.test(part));
    const bestPart = alphaParts.reduce(
      (best, part) => Math.max(best, nameSimilarity(part, firstName)),
      0,
    );
    score += Math.round(bestPart * 400);
  }

  return score;
}

function addCandidate(
  bucket: Map<string, VanityCandidate>,
  display: string,
  words: string[],
  firstName?: string,
): void {
  const normalized = display.toUpperCase();
  if (normalized.length < 5) return;

  const candidate: VanityCandidate = {
    display: normalized,
    speak: toSpeakablePhrase(normalized),
    score: scoreCandidate(normalized, words, firstName),
  };

  const existing = bucket.get(normalized);
  if (!existing || candidate.score > existing.score) {
    bucket.set(normalized, candidate);
  }
}

function suffixDigits(digits: string, match: WordMatch, length: number): string {
  const tail = digits.slice(match.end);
  if (tail.length >= length) {
    return tail.slice(-length);
  }
  return digits.slice(-length);
}

function mergeCandidates(
  primary: VanityCandidate[],
  secondary: VanityCandidate[],
  limit: number,
): VanityCandidate[] {
  const bucket = new Map<string, VanityCandidate>();
  for (const candidate of [...primary, ...secondary]) {
    const existing = bucket.get(candidate.display);
    if (!existing || candidate.score > existing.score) {
      bucket.set(candidate.display, candidate);
    }
  }

  return [...bucket.values()]
    .sort((a, b) => b.score - a.score || a.display.localeCompare(b.display))
    .slice(0, limit);
}

function generatePhoneWordCandidates(
  phoneNumber: string,
  firstName?: string,
  limit = 20,
): VanityCandidate[] {
  const digits = normalizePhoneDigits(phoneNumber);
  const bucket = new Map<string, VanityCandidate>();
  const matches = findWordMatches(digits);

  for (const match of matches) {
    const tail3 = suffixDigits(digits, match, 3);
    const tail4 = suffixDigits(digits, match, 4);

    addCandidate(bucket, `1-${match.word}-${tail3}`, [match.word], firstName);
    addCandidate(bucket, `1-${match.word}-${tail4}`, [match.word], firstName);
    addCandidate(bucket, `1-800-${match.word}`, [match.word], firstName);
    addCandidate(bucket, `1-888-${match.word}`, [match.word], firstName);
  }

  for (let i = 0; i < matches.length; i += 1) {
    for (let j = i + 1; j < matches.length; j += 1) {
      const first = matches[i];
      const second = matches[j];
      if (overlaps(first, second)) continue;

      const [left, right] = first.start < second.start ? [first, second] : [second, first];
      addCandidate(bucket, `1-${left.word}-${right.word}`, [left.word, right.word], firstName);

      const between = digits.slice(left.end, right.start);
      if (between.length <= 3 && between.length > 0) {
        addCandidate(
          bucket,
          `1-${left.word}-${between}-${right.word}`,
          [left.word, right.word],
          firstName,
        );
      }
    }
  }

  if (bucket.size < limit) {
    const fallbackWords = ['CASH', 'BANK', 'LOAN', 'HELP', 'SAVE', 'TRUST', 'MONEY', 'HOME'];
    const tail = digits.slice(-4);

    for (const word of fallbackWords) {
      addCandidate(bucket, `1-${word}-${tail}`, [word], firstName);
      addCandidate(bucket, `1-800-${word}`, [word], firstName);
    }
  }

  return [...bucket.values()]
    .sort((a, b) => b.score - a.score || a.display.localeCompare(b.display))
    .slice(0, limit);
}

/**
 * Build vanity numbers from the account phone, prioritizing options closest to the caller's first name.
 */
export function generateVanityCandidates(
  phoneNumber: string,
  firstName?: string,
  limit = 20,
): VanityCandidate[] {
  const trimmedName = firstName?.trim();

  if (trimmedName) {
    const personalized = generateNameVanityCandidates(phoneNumber, trimmedName, limit);
    const supplemental = generatePhoneWordCandidates(phoneNumber, trimmedName, limit);
    return mergeCandidates(personalized, supplemental, limit);
  }

  return generatePhoneWordCandidates(phoneNumber, undefined, limit);
}

export function scoreVanity(vanity: string): number {
  const letters = (vanity.match(/[A-Z]/gi) ?? []).length;
  const digits = (vanity.match(/[0-9]/g) ?? []).length;
  const words = vanity.split('-').filter((part) => /^[A-Z]+$/i.test(part)).length;
  return words * 100 + letters * 5 - digits * 2;
}
