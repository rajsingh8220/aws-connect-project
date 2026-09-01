/** Standard telephone keypad letter mapping. */
export const DIGIT_TO_LETTERS: Record<string, string> = {
  '2': 'ABC',
  '3': 'DEF',
  '4': 'GHI',
  '5': 'JKL',
  '6': 'MNO',
  '7': 'PQRS',
  '8': 'TUV',
  '9': 'WXYZ',
};

const LETTER_TO_DIGIT: Record<string, string> = Object.fromEntries(
  Object.entries(DIGIT_TO_LETTERS).flatMap(([digit, letters]) =>
    letters.split('').map((letter) => [letter, digit]),
  ),
);

/** Financial and call-center friendly words for vanity matching. */
export const VANITY_WORDS = [
  'BANK', 'CASH', 'LOAN', 'SAVE', 'DEBT', 'FUND', 'GROW', 'HELP', 'HOME', 'LIFE',
  'CALL', 'CARE', 'COIN', 'DEAL', 'EASY', 'FAST', 'FREE', 'GAIN', 'GOAL', 'IDEA',
  'MONEY', 'PAY', 'PLAN', 'RICH', 'SAFE', 'WISE', 'AUTO', 'DIS', 'FISH', 'TRUST',
  'WEALTH', 'CREDIT', 'INVEST', 'ASSET', 'VALUE', 'PROFIT', 'BUDGET', 'FINANCE',
  'ACE', 'MAX', 'PRO', 'VIP', 'TOP', 'BEST', 'PLUS', 'STAR', 'GOLD', 'CASHFLOW',
] as const;

export function normalizePhoneDigits(phoneNumber: string): string {
  return phoneNumber.replace(/\D/g, '').slice(-10);
}

export function wordToT9(word: string): string {
  return word
    .toUpperCase()
    .split('')
    .map((letter) => LETTER_TO_DIGIT[letter] ?? '')
    .join('');
}

export interface WordMatch {
  readonly word: string;
  readonly start: number;
  readonly end: number;
  readonly code: string;
}

export function findWordMatches(digits: string): WordMatch[] {
  const matches: WordMatch[] = [];

  for (const word of VANITY_WORDS) {
    const code = wordToT9(word);
    if (!code) continue;

    let index = 0;
    while ((index = digits.indexOf(code, index)) !== -1) {
      matches.push({ word, start: index, end: index + code.length, code });
      index += 1;
    }
  }

  return matches.sort((a, b) => b.code.length - a.code.length || a.start - b.start);
}

const DIGIT_NAMES: Record<string, string> = {
  '0': 'zero',
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'nine',
};

/** Build a Polly-friendly phrase: "one, C A S H, four seven" */
export function toSpeakablePhrase(vanity: string): string {
  return vanity
    .split('-')
    .map((part) => {
      if (/^\d+$/.test(part)) {
        return part
          .split('')
          .map((digit) => DIGIT_NAMES[digit] ?? digit)
          .join(' ');
      }

      if (/^[A-Z]+$/i.test(part)) {
        return part.toUpperCase().split('').join(' ');
      }

      return part;
    })
    .join(', ');
}
