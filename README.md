# ChatGPTroll

> *"Ah, thou hast a query, I see. First answer me these riddles three!"*

A pestering oracle of the mossy bridge. Ask the troll a question; before he'll answer, he'll demand you solve three riddles. Get three right (or three wrong) and the troll yields the answer he was guarding all along.

Built as a small, deliberately overdesigned chat: rhyming gatekeeper, parchment bubbles, a glowing center frame on a painted bridge scene, and a real LLM call hiding behind the theatre.

## Tech

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Anthropic SDK** — Claude answers the user's actual question once the troll's gate is passed
- Plain CSS (no Tailwind in app code; the footer mirrors Tailwind tokens for visual continuity with `robleto.com`)
- All art delivered as SVG so the layout scales cleanly: `public/bridge.svg`, `public/troll.svg`, `public/logo.svg`

## Run it locally

```bash
# 1. install
npm install

# 2. add your Anthropic key
cp .env.local.example .env.local
#    edit .env.local and set ANTHROPIC_API_KEY=sk-ant-...

# 3. start the dev server
npm run dev
```

Then open the URL Next prints (usually http://localhost:3000).

The troll's "consulting the moss…" beat is real — that's the `/api/answer` route making a `claude-opus-4-6` request server-side. Without a valid key you'll see the troll's fallback line ("By moss and mire — my oracle-stone hath dimmed!"), and the rest of the experience still plays.

## Project layout

```
src/
├─ app/
│  ├─ layout.tsx          fonts + html shell
│  ├─ globals.css         the whole visual system in one file
│  ├─ page.tsx            App + bubbles + riddle card + state machine
│  └─ api/answer/route.ts server-side Anthropic call
└─ lib/
   └─ riddles.ts          riddle bank, rhymes, fuzzy answer matching
public/
├─ bridge.svg, troll.svg, logo.svg   the painted scene
└─ _icons/                            social icons for the footer
```

## How the loop works

1. User asks a question. It's stored as the "real query" but not yet sent anywhere.
2. The troll responds with the intro rhyme and a `pickN(RIDDLE_BANK, 3)` slate.
3. For each riddle the user gets up to **3 attempts**:
   - A correct answer (fuzzy-matched: plurals via a small stemmer, typos via Damerau-Levenshtein distance ≤ 1 on words ≥ 5 chars) advances the slate.
   - After 3 wrong, the troll yields and **reveals** the answer with a `REVEALED` stamp, then advances.
4. Once all three slots are resolved (solved or revealed), the troll fires `/api/answer` against the user's original question and renders the response as a highlighted callout inside a final answer bubble.

The active riddle card uses `position: sticky` so it pins to the top of the glowing chat frame while the user's attempts and the troll's rhyming retorts stack below it.

## Credits

Illustrations and design by [Greg Robleto](https://www.robleto.com/).
Built with [Claude Code](https://claude.com/claude-code).
