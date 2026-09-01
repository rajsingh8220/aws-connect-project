import { DIGIT_TO_LETTERS, normalizePhoneDigits, toSpeakablePhrase, wordToT9 } from './t9';

export function normalizeFirstName(firstName: string): string {
  return firstName.trim().toUpperCase().replace(/[^A-Z]/g, '');
}

/** 0–1 score for how closely a vanity segment matches the caller's first name. */
export function nameSimilarity(segment: string, firstName: string): number {
  const left = segment.toUpperCase().replace(/[^A-Z]/g, '');
  const right = normalizeFirstName(firstName);
  if (!left || !right) return 0;

  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const overlap = [...new Set(left.split(''))].filter((char) => right.includes(char)).length;
  const prefixScore = prefix / right.length;
  const overlapScore = overlap / right.length;

  return Math.min(1, prefixScore * 0.7 + overlapScore * 0.3 + (left === right ? 0.25 : 0));
}

/** Pick keypad letters for each digit to spell the first name as closely as possible. */
export function spellDigitsTowardName(digits: string, firstName: string): string {
  const name = normalizeFirstName(firstName);
  if (!name) return digits;

  let nameIdx = 0;
  return digits
    .split('')
    .map((digit) => {
      const options = DIGIT_TO_LETTERS[digit];
      if (!options) return digit;

      if (nameIdx < name.length) {
        const target = name[nameIdx];
        if (options.includes(target)) {
          nameIdx += 1;
          return target;
        }

        const later = options.split('').find((letter) => name.slice(nameIdx).includes(letter));
        if (later) {
          nameIdx = name.indexOf(later, nameIdx) + 1;
          return later;
        }
      }

      return options[0];
    })
    .join('');
}

export interface NameVanityCandidate {
  readonly display: string;
  readonly speak: string;
  readonly score: number;
}

function addNameCandidate(
  bucket: Map<string, NameVanityCandidate>,
  display: string,
  firstName: string,
  baseScore: number,
): void {
  const normalized = display.toUpperCase();
  const alphaParts = normalized.split('-').filter((part) => /^[A-Z]+$/.test(part));
  const namePart = alphaParts.find((part) => part.length >= 3) ?? alphaParts[0] ?? '';
  const similarity = namePart ? nameSimilarity(namePart, firstName) : 0;

  const candidate: NameVanityCandidate = {
    display: normalized,
    speak: toSpeakablePhrase(normalized),
    score: baseScore + Math.round(similarity * 500),
  };

  const existing = bucket.get(normalized);
  if (!existing || candidate.score > existing.score) {
    bucket.set(normalized, candidate);
  }
}

/**
 * Build vanity options that keep the account phone digits but emphasize the caller's first name.
 */
export function generateNameVanityCandidates(
  phoneNumber: string,
  firstName: string,
  limit = 20,
): NameVanityCandidate[] {
  const digits = normalizePhoneDigits(phoneNumber);
  const name = normalizeFirstName(firstName);
  const bucket = new Map<string, NameVanityCandidate>();

  if (!digits || !name) {
    return [];
  }

  const fullSpelling = spellDigitsTowardName(digits, name);
  const tail3 = digits.slice(-3);
  const tail4 = digits.slice(-4);

  addNameCandidate(bucket, `1-${name}-${tail3}`, name, 900);
  addNameCandidate(bucket, `1-${name}-${tail4}`, name, 880);
  addNameCandidate(bucket, `1-800-${name}`, name, 860);

  if (name.length > 3) {
    addNameCandidate(bucket, `1-${name.slice(0, 3)}-${tail4}`, name, 820);
    addNameCandidate(bucket, `1-${name.slice(0, 4)}-${tail3}`, name, 810);
  }

  addNameCandidate(bucket, `1-${fullSpelling}`, name, 750);
  addNameCandidate(
    bucket,
    `1-${fullSpelling.slice(0, 3)}-${fullSpelling.slice(3, 6)}-${fullSpelling.slice(6)}`,
    name,
    740,
  );

  const nameT9 = wordToT9(name);
  if (nameT9) {
    const index = digits.indexOf(nameT9);
    if (index >= 0) {
      addNameCandidate(bucket, `1-${name}-${digits.slice(index + nameT9.length)}`, name, 950);
    }
  }

  for (let start = 0; start < digits.length - 2; start += 1) {
    for (let len = 3; len <= Math.min(7, digits.length - start); len += 1) {
      const slice = digits.slice(start, start + len);
      const spelling = spellDigitsTowardName(slice, name);
      if (nameSimilarity(spelling, name) < 0.35) continue;

      const tail = digits.slice(start + len);
      addNameCandidate(bucket, `1-${spelling}-${tail.slice(-3)}`, name, 700);
      addNameCandidate(bucket, `1-${spelling}-${tail.slice(-4)}`, name, 680);
    }
  }

  return [...bucket.values()]
    .sort((a, b) => b.score - a.score || a.display.localeCompare(b.display))
    .slice(0, limit);
}
