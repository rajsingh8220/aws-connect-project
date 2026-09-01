import {
  findWordMatches,
  normalizePhoneDigits,
  toSpeakablePhrase,
  type WordMatch,
} from './t9';

export interface VanityCandidate {
  readonly display: string;
  readonly speak: string;
  readonly score: number;
}

function overlaps(a: WordMatch, b: WordMatch): boolean {
  return a.start < b.end && b.start < a.end;
}

function scoreCandidate(display: string, words: string[]): number {
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

  return score;
}

function addCandidate(
  bucket: Map<string, VanityCandidate>,
  display: string,
  words: string[],
): void {
  const normalized = display.toUpperCase();
  if (normalized.length < 5) return;

  const candidate: VanityCandidate = {
    display: normalized,
    speak: toSpeakablePhrase(normalized),
    score: scoreCandidate(normalized, words),
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

/**
 * Build vanity numbers from real dictionary words that match T9 encodings
 * in the account phone number, plus speakable phrases for Connect Polly.
 */
export function generateVanityCandidates(phoneNumber: string, limit = 20): VanityCandidate[] {
  const digits = normalizePhoneDigits(phoneNumber);
  const bucket = new Map<string, VanityCandidate>();
  const matches = findWordMatches(digits);

  for (const match of matches) {
    const tail3 = suffixDigits(digits, match, 3);
    const tail4 = suffixDigits(digits, match, 4);

    addCandidate(bucket, `1-${match.word}-${tail3}`, [match.word]);
    addCandidate(bucket, `1-${match.word}-${tail4}`, [match.word]);
    addCandidate(bucket, `1-800-${match.word}`, [match.word]);
    addCandidate(bucket, `1-888-${match.word}`, [match.word]);
  }

  for (let i = 0; i < matches.length; i += 1) {
    for (let j = i + 1; j < matches.length; j += 1) {
      const first = matches[i];
      const second = matches[j];
      if (overlaps(first, second)) continue;

      const [left, right] = first.start < second.start ? [first, second] : [second, first];
      addCandidate(bucket, `1-${left.word}-${right.word}`, [left.word, right.word]);

      const between = digits.slice(left.end, right.start);
      if (between.length <= 3 && between.length > 0) {
        addCandidate(bucket, `1-${left.word}-${between}-${right.word}`, [left.word, right.word]);
      }
    }
  }

  if (bucket.size < limit) {
    const fallbackWords = ['CASH', 'BANK', 'LOAN', 'HELP', 'SAVE', 'TRUST', 'MONEY', 'HOME'];
    const tail = digits.slice(-4);

    for (const word of fallbackWords) {
      addCandidate(bucket, `1-${word}-${tail}`, [word]);
      addCandidate(bucket, `1-800-${word}`, [word]);
    }
  }

  return [...bucket.values()]
    .sort((a, b) => b.score - a.score || a.display.localeCompare(b.display))
    .slice(0, limit);
}

export function scoreVanity(vanity: string): number {
  const letters = (vanity.match(/[A-Z]/gi) ?? []).length;
  const digits = (vanity.match(/[0-9]/g) ?? []).length;
  const words = vanity.split('-').filter((part) => /^[A-Z]+$/i.test(part)).length;
  return words * 100 + letters * 5 - digits * 2;
}
