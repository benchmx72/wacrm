"use client";

import { useState, useRef, useCallback, KeyboardEvent } from "react";
import { Bot, Send, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ReplyQuote } from "./reply-quote";
import { useLanguage } from "@/hooks/use-language";

interface ReplyDraft {
  /** Internal UUID of the message being replied to — sent back through onSend. */
  id: string;
  authorLabel: string;
  preview: string;
}

interface MessageComposerProps {
  sessionExpired: boolean;
  onSend: (text: string, replyToId?: string) => void;
  onOpenTemplates?: () => void;
  onSuggestReply?: () => Promise<string>;
  replyTo?: ReplyDraft | null;
  onClearReply?: () => void;
}

export function MessageComposer({
  sessionExpired,
  onSend,
  onOpenTemplates,
  onSuggestReply,
  replyTo,
  onClearReply,
}: MessageComposerProps) {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // Max 4 lines (~96px)
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || sessionExpired) return;

    setSending(true);
    try {
      onSend(trimmed, replyTo?.id);
      setText("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } finally {
      setSending(false);
    }
  }, [text, sending, sessionExpired, onSend, replyTo?.id]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      adjustHeight();
    },
    [adjustHeight]
  );

  const handleSuggest = useCallback(async () => {
    if (!onSuggestReply || suggesting || sessionExpired) return;
    setSuggesting(true);
    try {
      const suggestion = await onSuggestReply();
      setText(suggestion);
      requestAnimationFrame(adjustHeight);
      textareaRef.current?.focus();
    } finally {
      setSuggesting(false);
    }
  }, [adjustHeight, onSuggestReply, sessionExpired, suggesting]);

  return (
    <div className="border-t border-slate-800 bg-slate-900 p-3">
      {replyTo && (
        <div className="mb-2">
          <ReplyQuote
            authorLabel={replyTo.authorLabel}
            preview={replyTo.preview}
            onDismiss={onClearReply}
          />
        </div>
      )}
      {sessionExpired && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2">
          <p className="text-xs text-amber-400">
            {t("inbox.composer.sessionExpired")}
          </p>
          {onOpenTemplates && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-amber-400 hover:text-amber-300"
              onClick={onOpenTemplates}
            >
              <LayoutTemplate className="mr-1 h-3 w-3" />
              {t("inbox.composer.templates")}
            </Button>
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        {onSuggestReply && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 shrink-0 px-2 text-slate-400 hover:text-white"
            onClick={handleSuggest}
            disabled={sessionExpired || suggesting}
            title={t("inbox.composer.suggest")}
          >
            <Bot className="h-4 w-4" />
            <span className="hidden text-xs sm:inline">
              {suggesting ? t("inbox.composer.suggesting") : t("inbox.composer.suggest")}
            </span>
          </Button>
        )}

        {onOpenTemplates && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 shrink-0 p-0 text-slate-400 hover:text-white"
            onClick={onOpenTemplates}
            title={t("inbox.composer.sendTemplate")}
          >
            <LayoutTemplate className="h-4 w-4" />
          </Button>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            sessionExpired
              ? t("inbox.composer.expiredPlaceholder")
              : t("inbox.composer.placeholder")
          }
          disabled={sessionExpired}
          rows={1}
          className={cn(
            "flex-1 resize-none rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-primary/50",
            sessionExpired && "cursor-not-allowed opacity-50"
          )}
        />

        <Button
          size="sm"
          className="h-9 w-9 shrink-0 bg-primary p-0 hover:bg-primary/90 disabled:opacity-40"
          disabled={!text.trim() || sessionExpired || sending}
          onClick={handleSend}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* Hint sits outside the flex row so its height doesn't push
          `items-end` buttons below the textarea. Indented to line up
          under the textarea left edge (w-9 button + gap-2 = 44px). */}
      <p className="mt-1 pl-11 text-[10px] text-slate-600">
        {t("inbox.composer.quickRepliesHint")}
      </p>
    </div>
  );
}
