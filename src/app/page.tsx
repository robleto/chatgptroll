"use client";

import { useEffect, useRef, useState } from "react";
import {
  FINAL_RHYME,
  INTRO_RHYME,
  NEXT_RHYMES,
  NUDGE_RHYMES,
  POST_ANSWER_RHYMES,
  RIDDLE_BANK,
  WRONG_RHYMES,
  isCorrect,
  nowTime,
  pickN,
  type Riddle,
  type RhymePart,
  type RhymeLine,
} from "@/lib/riddles";

type Phase = "idle" | "riddling" | "fetching" | "done";

type Feedback = { kind: "correct" | "wrong"; text: string } | null;

type Message =
  | { kind: "user"; text: string; time: string }
  | { kind: "troll"; lines?: RhymeLine[]; plain?: string; time: string; final?: boolean }
  | { kind: "riddle"; riddleIdx: number };

type Floater = { id: number; text: string; kind: "good" | "bad" };

function RhymeLines({ lines }: { lines: RhymeLine[] }) {
  return (
    <>
      {lines.map((line, i) => {
        const atoms: RhymePart[] = typeof line === "string" ? [line] : line;
        return (
          <span key={i} className="rhyme-line">
            {atoms.map((atom, j) =>
              typeof atom === "string" ? (
                <span key={j}>{atom}</span>
              ) : (
                <span key={j} className="accent">{atom.accent}</span>
              ),
            )}
          </span>
        );
      })}
    </>
  );
}

function UserBubble({ text, time }: { text: string; time: string }) {
  return (
    <div className="bubble-user bubble-enter">
      <div className="who">You</div>
      <div className="text">{text}</div>
      <div className="meta">{time}<span className="check">✓✓</span></div>
    </div>
  );
}

function TrollBubble({
  lines,
  plain,
  time,
  final,
}: {
  lines?: RhymeLine[];
  plain?: string;
  time: string;
  final?: boolean;
}) {
  return (
    <div className={`bubble-troll bubble-enter ${final ? "final" : ""}`}>
      <div className="who">
        Troll
        {final && <span className="stamp">★ ANSWER ★</span>}
      </div>
      <div className="body">
        {lines && <RhymeLines lines={lines} />}
        {plain && <span>{plain}</span>}
      </div>
      <div className="meta">{time}</div>
    </div>
  );
}

function RiddleCard({
  index,
  riddle,
  solved,
  revealed,
  active,
  value,
  onChange,
  onSubmit,
  feedback,
  locked,
}: {
  index: number;
  riddle: Riddle;
  solved: boolean;
  revealed: boolean;
  active: boolean;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  feedback: Feedback;
  locked: boolean;
}) {
  const done = solved || revealed;
  const classes = [
    "riddle-card",
    "bubble-enter",
    solved ? "solved" : "",
    revealed ? "revealed" : "",
    active ? "active" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes}>
      {solved && <div className="solved-stamp">SOLVED</div>}
      {revealed && <div className="revealed-stamp">REVEALED</div>}
      <div className="head">
        <span className="flourish">❧</span>
        <span className="label">Riddle {index + 1}</span>
        <span className="flourish">☙</span>
      </div>
      <div className="question">&ldquo;{riddle.q}&rdquo;</div>
      {revealed && (
        <div className="revealed-answer">
          The answer was <strong>{riddle.a[0].toUpperCase()}</strong>
        </div>
      )}
      {!done && !locked && (
        <div className="input-block">
          <div className="input-row">
            <input
              type="text"
              placeholder="Thy answer…"
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && value && value.trim()) onSubmit();
              }}
              autoFocus
            />
            {value && (
              <button className="clear" onClick={() => onChange("")} aria-label="clear">×</button>
            )}
          </div>
          <button className="submit" disabled={!value || !value.trim()} onClick={onSubmit}>
            <span>✦</span> Answer the Riddle
          </button>
          {feedback && <div className={`feedback ${feedback.kind}`}>{feedback.text}</div>}
        </div>
      )}
      <div className="bottom-rule">
        <span className="line" />
        <span className="diamond" />
        <span className="line" />
      </div>
    </div>
  );
}

const MAX_WRONG_BEFORE_REVEAL = 3;

function remainingPhrase(remaining: number): string {
  if (remaining <= 0) return "Now thy quest doth reach its end — the answer cometh!";
  if (remaining === 1) return "Yet one riddle stands betwixt thee and thy answer — press on, traveler!";
  return "Yet two riddles stand betwixt thee and thy answer — press on, traveler!";
}

function makeRevealText(canonicalAnswer: string, remaining: number): string {
  const ans = canonicalAnswer.toUpperCase();
  return `Thrice hast thou guessed amiss — by mossy mercy, I yield! The answer was ${ans}. ${remainingPhrase(remaining)}`;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [riddles, setRiddles] = useState<Riddle[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [riddleInput, setRiddleInput] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [questionInput, setQuestionInput] = useState("");
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [showTooltip, setShowTooltip] = useState(true);
  const [shimmer, setShimmer] = useState(0);
  const [revealedIdx, setRevealedIdx] = useState<Set<number>>(new Set());
  const chatRef = useRef<HTMLDivElement>(null);
  const floatId = useRef(0);
  const wrongCount = useRef(0);
  const lastQuestion = useRef("");

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, stepIdx, phase]);

  function pushFloater(text: string, kind: "good" | "bad") {
    const id = ++floatId.current;
    setFloaters((f) => [...f, { id, text, kind }]);
    setTimeout(() => setFloaters((f) => f.filter((it) => it.id !== id)), 1700);
  }

  function appendMsg(m: Message) {
    setMessages((prev) => [...prev, m]);
  }

  function startQuest(question: string) {
    if (!question.trim()) return;
    if (phase === "riddling" || phase === "fetching") return;

    setShowTooltip(false);
    const q = question.trim();
    lastQuestion.current = q;
    appendMsg({ kind: "user", text: q, time: nowTime() });
    setQuestionInput("");

    const chosen = pickN(RIDDLE_BANK, 3);
    setRiddles(chosen);
    setStepIdx(0);
    setRiddleInput("");
    setFeedback(null);
    setRevealedIdx(new Set());
    wrongCount.current = 0;

    setTimeout(() => {
      appendMsg({ kind: "troll", lines: INTRO_RHYME, time: nowTime() });
      setTimeout(() => {
        appendMsg({ kind: "riddle", riddleIdx: 0 });
        setPhase("riddling");
      }, 700);
    }, 550);
  }

  function submitRiddle() {
    if (phase !== "riddling") return;
    const r = riddles[stepIdx];
    if (!r) return;
    const attempt = riddleInput.trim();
    if (!attempt) return;
    appendMsg({ kind: "user", text: attempt, time: nowTime() });
    const correct = isCorrect(riddleInput, r.a);
    if (correct) {
      pushFloater("Correct!", "good");
      setFeedback({ kind: "correct", text: "✦ A worthy answer! ✦" });
      wrongCount.current = 0;
      const next = stepIdx + 1;
      setTimeout(() => {
        if (next >= 3) {
          setShimmer(Date.now());
          appendMsg({ kind: "troll", lines: FINAL_RHYME, time: nowTime() });
          setStepIdx(3);
          setRiddleInput("");
          setFeedback(null);
          setPhase("fetching");
          void fetchFinalAnswer();
        } else {
          const rhyme = NEXT_RHYMES[next - 1] || NEXT_RHYMES[0];
          appendMsg({ kind: "troll", lines: rhyme, time: nowTime() });
          setTimeout(() => {
            appendMsg({ kind: "riddle", riddleIdx: next });
            setStepIdx(next);
            setRiddleInput("");
            setFeedback(null);
          }, 500);
        }
      }, 800);
    } else {
      pushFloater("Nay!", "bad");
      setFeedback({ kind: "wrong", text: "✗ Nay, not quite. ✗" });
      const attemptsSoFar = wrongCount.current + 1;
      wrongCount.current = attemptsSoFar;

      if (attemptsSoFar >= MAX_WRONG_BEFORE_REVEAL) {
        // Reveal flow — show the answer, advance like a solved riddle, but as REVEALED.
        const revealedAt = stepIdx;
        const next = stepIdx + 1;
        const remaining = 3 - next;
        const text = makeRevealText(r.a[0], remaining);
        setRevealedIdx((prev) => {
          const out = new Set(prev);
          out.add(revealedAt);
          return out;
        });
        appendMsg({ kind: "troll", plain: text, time: nowTime() });
        wrongCount.current = 0;
        setRiddleInput("");
        setFeedback(null);

        setTimeout(() => {
          if (next >= 3) {
            setShimmer(Date.now());
            appendMsg({ kind: "troll", lines: FINAL_RHYME, time: nowTime() });
            setStepIdx(3);
            setPhase("fetching");
            void fetchFinalAnswer();
          } else {
            const rhyme = NEXT_RHYMES[next - 1] || NEXT_RHYMES[0];
            appendMsg({ kind: "troll", lines: rhyme, time: nowTime() });
            setTimeout(() => {
              appendMsg({ kind: "riddle", riddleIdx: next });
              setStepIdx(next);
            }, 500);
          }
        }, 1200);
      } else {
        const idx = Math.min(attemptsSoFar - 1, WRONG_RHYMES.length - 1);
        appendMsg({ kind: "troll", lines: WRONG_RHYMES[idx], time: nowTime() });
        setTimeout(() => setFeedback(null), 1600);
      }
    }
  }

  async function fetchFinalAnswer() {
    const userQ = lastQuestion.current;
    let answer = "";
    try {
      const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: userQ }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data: { answer?: string } = await res.json();
      answer = (data.answer || "").trim();
      if (!answer) throw new Error("empty");
    } catch {
      answer = "By moss and mire — my oracle-stone hath dimmed! Try thy question once more, traveler.";
    }
    setTimeout(() => {
      appendMsg({ kind: "troll", plain: answer, time: nowTime(), final: true });
      setTimeout(() => {
        const rh = POST_ANSWER_RHYMES[Math.floor(Math.random() * POST_ANSWER_RHYMES.length)];
        appendMsg({ kind: "troll", lines: rh, time: nowTime() });
        setPhase("done");
      }, 600);
    }, 400);
  }

  function nudge() {
    const rh = NUDGE_RHYMES[Math.floor(Math.random() * NUDGE_RHYMES.length)];
    appendMsg({ kind: "troll", lines: rh, time: nowTime() });
  }

  return (
    <>
    <div className="app">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="troll-layer" src="/troll.svg?v=3" alt="" aria-hidden="true" />

      <header className="page-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" src="/logo.svg?v=3" alt="ChatGPTroll" />
        <button
          className="help-link"
          onClick={() => setShowTooltip((v) => !v)}
          aria-expanded={showTooltip}
        >
          What is this?
        </button>
      </header>

      <main className="chat-col">
        <div className="chat-thread" ref={chatRef}>
          {showTooltip && (
            <div className="help-tooltip" role="tooltip">
              Ask a question. Answer three riddles.
              <br />
              Then the troll gives you your answer.
              <button
                className="close"
                onClick={() => setShowTooltip(false)}
                aria-label="close"
              >
                ×
              </button>
            </div>
          )}
          {messages.map((m, i) => {
            if (m.kind === "user") return <UserBubble key={i} text={m.text} time={m.time} />;
            if (m.kind === "troll")
              return (
                <TrollBubble
                  key={i}
                  lines={m.lines}
                  plain={m.plain}
                  time={m.time}
                  final={m.final}
                />
              );
            if (m.kind === "riddle") {
              const r = riddles[m.riddleIdx];
              if (!r) return null;
              const isCurrent = m.riddleIdx === stepIdx && phase === "riddling";
              const isRevealed = revealedIdx.has(m.riddleIdx);
              const isDone =
                m.riddleIdx < stepIdx || (phase !== "riddling" && stepIdx >= 3);
              const isSolved = isDone && !isRevealed;
              return (
                <RiddleCard
                  key={i}
                  index={m.riddleIdx}
                  riddle={r}
                  solved={isSolved}
                  revealed={isRevealed}
                  active={isCurrent}
                  locked={!isCurrent && !isDone}
                  value={isCurrent ? riddleInput : ""}
                  onChange={setRiddleInput}
                  onSubmit={submitRiddle}
                  feedback={isCurrent ? feedback : null}
                />
              );
            }
            return null;
          })}
          {phase === "fetching" && (
            <div className="bubble-troll bubble-enter thinking" aria-live="polite">
              <div className="who">Troll</div>
              <div className="body">
                <span className="thinking-dots" aria-hidden="true">
                  <span /><span /><span />
                </span>
                <span className="thinking-text"> consulting the moss…</span>
              </div>
            </div>
          )}
        </div>

        <div className="input-bar">
          <div className="chat-icon">💬</div>
          <input
            type="text"
            placeholder={
              phase === "riddling"
                ? "Answer the riddle above first…"
                : phase === "fetching"
                  ? "The troll consults the moss…"
                  : "Ask the troll a question…"
            }
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
            disabled={phase === "fetching"}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (phase === "riddling") nudge();
                else if (phase !== "fetching") startQuest(questionInput);
              }
            }}
          />
          <button
            className="send"
            disabled={phase === "fetching" || (!questionInput.trim() && phase !== "riddling")}
            onClick={() => {
              if (phase === "riddling") nudge();
              else startQuest(questionInput);
            }}
            aria-label="send"
          >
            ↑
          </button>
        </div>
      </main>

      {floaters.map((f) => (
        <div key={f.id} className={`floater ${f.kind === "bad" ? "bad" : ""}`}>
          {f.text}
        </div>
      ))}

      {shimmer ? <div key={shimmer} className="shimmer" /> : null}
    </div>
    <SiteFooter />
    </>
  );
}

const SOCIAL_LINKS: { href: string; icon: string; label: string }[] = [
  { href: "https://www.robleto.com", icon: "/_icons/website-icon.svg", label: "Website" },
  { href: "https://www.codepen.com/robleto", icon: "/_icons/codepen-icon.svg", label: "CodePen" },
  { href: "https://www.dribbble.com/robleto", icon: "/_icons/dribbble-icon.svg", label: "Dribbble" },
  { href: "https://www.github.com/robleto", icon: "/_icons/github-icon.svg", label: "GitHub" },
  { href: "https://www.linkedin.com/in/robleto", icon: "/_icons/linkedin-icon.svg", label: "LinkedIn" },
];

function SiteFooter() {
  return (
    <footer className="site-footer">
      <p className="footer-left">&nbsp;</p>
      <div className="footer-right">
        <p className="footer-credit">
          Illustrations and Design by{" "}
          <a href="https://www.robleto.com/" target="_blank" rel="noopener noreferrer">
            Greg Robleto
          </a>
        </p>
        <div className="social-icons">
          {SOCIAL_LINKS.map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.icon} alt={s.label} width={24} height={24} loading="lazy" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
