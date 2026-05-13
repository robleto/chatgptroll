export type Riddle = { q: string; a: string[] };

export const RIDDLE_BANK: Riddle[] = [
  { q: "What has keys but can't open locks?", a: ["piano", "keyboard", "a piano", "a keyboard", "computer keyboard"] },
  { q: "What has hands but cannot clap?", a: ["clock", "a clock", "watch", "a watch"] },
  { q: "The more you take, the more you leave behind. What am I?", a: ["footsteps", "steps", "footprints"] },
  { q: "What has a head and a tail, but no body?", a: ["coin", "a coin", "penny", "a penny"] },
  { q: "What gets wetter the more it dries?", a: ["towel", "a towel"] },
  { q: "The more there is of it, the less you see. What is it?", a: ["darkness", "the dark", "dark", "fog"] },
  { q: "I'm tall when young, and short when old. What am I?", a: ["candle", "a candle", "pencil", "a pencil"] },
  { q: "What has many teeth, but cannot bite?", a: ["comb", "zipper", "a comb", "a zipper", "saw", "a saw"] },
  { q: "I have cities but no houses, mountains but no trees. What am I?", a: ["map", "a map", "atlas", "an atlas"] },
  { q: "What can travel the world while staying in one corner?", a: ["stamp", "a stamp", "postage stamp"] },
  { q: "What has an eye but cannot see?", a: ["needle", "a needle", "storm", "a storm", "hurricane", "a hurricane"] },
  { q: "I have branches, but no fruit, trunk, or leaves. What am I?", a: ["bank", "a bank", "library", "a library"] },
  { q: "What goes up but never comes down?", a: ["age", "your age"] },
  { q: "What has a neck but no head?", a: ["bottle", "a bottle", "shirt", "a shirt"] },
  { q: "What has to be broken before you can use it?", a: ["egg", "an egg"] },
];

export type RhymePart = string | { accent: string };
// A line is either a plain string or a sequence of inline atoms.
export type RhymeLine = string | RhymePart[];

export const INTRO_RHYME: RhymeLine[] = [
  "Ah, thou hast a query, I see.",
  ["First answer me these riddles ", { accent: "three!" }],
];

export const NEXT_RHYMES: RhymeLine[][] = [
  ["A worthy guess! A clever shout!", "Now hark — the next that comes about:"],
  ["Well solved, by moss and mire!", "Another riddle, somewhat dire:"],
  ["Aye, well done, ye sharpened soul!", "One stone less upon thy toll!"],
];

export const WRONG_RHYMES: RhymeLine[][] = [
  ["Ho ho ho, a foolish guess!", "Think again, and clean this mess!"],
  ["Nay, nay, nay — that won't suffice!", "Guess again, and be precise!"],
  ["By bridge and brook, that be not it!", "Try once more with sharper wit!"],
  ["Thy answer wilts like rain-soaked rye —", "Have at it, friend! Give it new try!"],
];

export const FINAL_RHYME: RhymeLine[] = [
  "Three riddles felled! Thy mind, well-wrought!",
  "Behold — the answer thou hast sought:",
];

export const POST_ANSWER_RHYMES: RhymeLine[][] = [
  ["Should'st thou desire another quest,", "speak thy question — I'll do my best!"],
  ["The bridge stands ready, vines and all —", "pose thy next, and I shall call!"],
];

export const NUDGE_RHYMES: RhymeLine[][] = [
  ["A question first must pass thy lip,", "then we'll dance the riddle's trip!"],
  ["Hold thy tongue 'til the riddle's done,", "then thy answer shall be spun!"],
];

export function normalize(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/** Strip common English plural/derivative suffixes so "eggs" ≡ "egg". */
function stemSimple(word: string): string {
  if (word.length < 4) return word;
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (/(sses|xes|zes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Stem every word in a phrase (preserves order). */
function stemPhrase(phrase: string): string {
  return phrase.split(" ").map(stemSimple).join(" ");
}

/**
 * Damerau-Levenshtein with an early-exit cap. Counts a single adjacent
 * transposition as one edit, so "candel" -> "candle" is distance 1.
 */
function levenshtein(a: string, b: string, cap: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  // 2-D DP (O(m*n) memory) so we can read prev-prev rows for the transposition check.
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(
        dp[i - 1][j] + 1,        // deletion
        dp[i][j - 1] + 1,        // insertion
        dp[i - 1][j - 1] + cost, // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, dp[i - 2][j - 2] + 1); // transposition
      }
      dp[i][j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
  }
  return dp[m][n];
}

function tokens(phrase: string): string[] {
  return phrase.split(" ").filter((t) => t.length > 1);
}

function fuzzyMatch(user: string, accepted: string): boolean {
  const u = normalize(user);
  const a = normalize(accepted);
  if (!u || !a) return false;

  // exact
  if (u === a) return true;
  // word-boundary substring (handles "piano" inside "a piano")
  if ((" " + u + " ").includes(" " + a + " ")) return true;

  // stem-aware: fold plurals etc.
  const stemU = stemPhrase(u);
  const stemA = stemPhrase(a);
  if (stemU === stemA) return true;
  if ((" " + stemU + " ").includes(" " + stemA + " ")) return true;

  // single-word user answer should match any meaningful token of the accepted phrase
  // (so "eggs" matches "an egg" → stem to "egg" → tokens of "an egg" contain "egg")
  if (!u.includes(" ")) {
    for (const tok of tokens(a)) {
      if (stemU === stemSimple(tok)) return true;
    }
  }

  // typo tolerance: only for sufficiently long single-word answers
  if (!u.includes(" ") && !a.includes(" ")) {
    if (a.length >= 5 && levenshtein(u, a, 1) <= 1) return true;
    if (stemA.length >= 5 && levenshtein(stemU, stemA, 1) <= 1) return true;
  }

  return false;
}

export function isCorrect(userAnswer: string, accepted: string[]): boolean {
  if (!normalize(userAnswer)) return false;
  return accepted.some((a) => fuzzyMatch(userAnswer, a));
}

export function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

export function nowTime(): string {
  const d = new Date();
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = ((h + 11) % 12) + 1;
  return `${h}:${m} ${ampm}`;
}
