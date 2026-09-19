// TrustBot — the desk's assistant, as a dialog over the page rather than a
// page of its own.
//
// The desk stays visible and goes out of focus behind it (see .tr-bot-scrim):
// you are asking a question ABOUT this page, mid-trade, not leaving it. A
// route would have thrown away the context that makes the question askable.
//
// NOT CONNECTED YET. It takes the question, shows it, thinks, and answers
// honestly that it cannot answer. That is deliberate: a placeholder that
// invents plausible-sounding answers about settlement or trustlines would be
// worse than no assistant at all — people act on what a desk tells them. When
// there is a real backend, `reply()` is the one function that changes.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, X } from 'lucide-react';
import { BrandMark } from '../brand/mark';

interface Message {
  id: number;
  from: 'you' | 'bot';
  text: string;
}

/** Questions a taker actually has in front of this panel. They are real
 *  questions with real answers — which is why they are the seeds for the
 *  backend rather than decorative chips. */
const SUGGESTIONS = [
  'Why did my quote expire?',
  'What is a trustline, and do I need one?',
  'Who pays the protocol fee?',
] as const;

const GREETING =
  "Ask me anything about this desk — quotes, trustlines, settlement, or why something did not go through.";

/** The one function that changes when a backend exists. */
const reply = (): string =>
  "I'm not connected yet — this is the interface, not the answer. When TrustBot goes live it will read your last request, the quotes you were shown and the on-chain result, and answer from those rather than from guesswork.";

export function TrustBot({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  // Escape closes, and the body stops scrolling underneath. Both only while
  // open: a keydown handler that outlives its dialog starts eating other
  // components' shortcuts.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // focus after the entrance, or the scroll-into-view of a focused input
    // fights the panel's own transform
    const focus = window.setTimeout(() => inputRef.current?.focus(), 220);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      window.clearTimeout(focus);
    };
  }, [open, onClose]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Keep the newest message in view. Called after every change to the log.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const send = useCallback((text: string) => {
    const question = text.trim();
    if (!question || thinking) return;

    setMessages((m) => [...m, { id: nextId.current++, from: 'you', text: question }]);
    setDraft('');
    setThinking(true);

    // A beat before the answer. Not theatre: an answer that appears in the
    // same frame as the question reads as a canned string, which is exactly
    // what this one is — and pretending otherwise is the part to avoid.
    timer.current = window.setTimeout(() => {
      setMessages((m) => [...m, { id: nextId.current++, from: 'bot', text: reply() }]);
      setThinking(false);
    }, 900);
  }, [thinking]);

  return (
    <div data-open={open} className="tr-bot fixed inset-0 z-50 flex items-end justify-center
      p-4 sm:items-center sm:p-6">
      <button type="button" onClick={onClose} tabIndex={-1} aria-hidden="true"
        className="tr-bot-scrim absolute inset-0 cursor-default" />

      <div role="dialog" aria-modal="true" aria-label="TrustBot"
        className="tr-bot-panel relative flex h-[min(40rem,88vh)] w-full max-w-2xl flex-col
          overflow-hidden rounded-card border border-carbon-line bg-carbon-card/85 backdrop-blur-2xl">

        <header className="flex items-center gap-3 border-b border-carbon-line px-6 py-4">
          <span className="flex size-8 items-center justify-center rounded-full bg-carbon-deep">
            <BrandMark size={15} className="text-lime" />
          </span>
          <span className="flex-1">
            <span className="block font-grotesk text-[15px] font-medium text-snow">TrustBot</span>
            <span className="block font-grotesk text-[12px] text-slate">
              Not connected yet · answers are placeholders
            </span>
          </span>
          <button type="button" onClick={onClose} aria-label="Close TrustBot"
            className="flex size-8 items-center justify-center rounded-full text-slate
              transition-colors duration-500 ease-glide hover:bg-carbon-hi hover:text-snow">
            <X className="size-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </header>

        <div ref={logRef} className="flex-1 overflow-y-auto px-6 py-6">
          {messages.length === 0 ? (
            <div className="tr-msg">
              <p className="font-grotesk text-[15px] leading-relaxed text-ash">{GREETING}</p>
              <div className="mt-5 flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)}
                    className="group rounded-well border border-carbon-line bg-carbon-deep/40 px-4
                      py-3 text-left font-grotesk text-[14px] text-ash transition-colors
                      duration-500 ease-glide hover:border-lime/25 hover:bg-carbon-deep
                      hover:text-snow">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((m) => (
                <div key={m.id}
                  className={`tr-msg flex ${m.from === 'you' ? 'justify-end' : 'justify-start'}`}>
                  <p className={`max-w-[85%] rounded-well px-4 py-3 font-grotesk text-[14px]
                    leading-relaxed ${m.from === 'you'
                      ? 'bg-lime text-carbon'
                      : 'border border-carbon-line bg-carbon-deep/60 text-ash'}`}>
                    {m.text}
                  </p>
                </div>
              ))}

              {thinking ? (
                <div className="tr-msg flex justify-start">
                  <span className="tr-think flex items-center gap-1.5 rounded-well border
                    border-carbon-line bg-carbon-deep/60 px-4 py-4" aria-label="TrustBot is typing">
                    <span className="size-1.5 rounded-full bg-lime" />
                    <span className="size-1.5 rounded-full bg-lime" />
                    <span className="size-1.5 rounded-full bg-lime" />
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); send(draft); }}
          className="tr-field relative flex items-center gap-2 border-t border-carbon-line
            px-4 py-3.5">
          <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about quotes, trustlines, settlement…" aria-label="Your question"
            className="min-w-0 flex-1 !border-0 !bg-transparent px-3 py-2.5 font-grotesk
              text-[15px] !text-snow outline-none placeholder:text-slate/70" />
          <button type="submit" disabled={!draft.trim() || thinking} aria-label="Send"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-lime
              text-carbon transition-colors duration-500 ease-glide hover:bg-lime-soft
              disabled:cursor-not-allowed disabled:bg-carbon-hi disabled:text-slate">
            <ArrowUp className="size-4" strokeWidth={2} aria-hidden="true" />
          </button>
          <span className="tr-field-rule absolute inset-x-0 bottom-0 block h-[1.5px] bg-lime/70"
            aria-hidden="true" />
        </form>
      </div>
    </div>
  );
}
