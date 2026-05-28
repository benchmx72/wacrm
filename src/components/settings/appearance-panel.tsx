"use client";

import { Check, Languages } from "lucide-react";

import { useLanguage } from "@/hooks/use-language";
import { useTheme } from "@/hooks/use-theme";
import { LANGUAGE_LABELS, LOCALES, type Locale } from "@/lib/i18n";
import { THEMES, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";

export function AppearancePanel() {
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useLanguage();

  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">
            {t("settings.appearance.languageTitle")}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {t("settings.appearance.languageDescription")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {LOCALES.map((item) => (
            <LanguageCard
              key={item}
              locale={item}
              isActive={item === locale}
              onPick={() => setLocale(item)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">
            {t("settings.appearance.colorTitle")}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {t("settings.appearance.colorDescription")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {THEMES.map((item) => (
            <ThemeCard
              key={item.id}
              id={item.id}
              name={item.name}
              tagline={item.tagline}
              swatch={item.swatch}
              isActive={item.id === theme}
              onPick={() => setTheme(item.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function LanguageCard({
  locale,
  isActive,
  onPick,
}: {
  locale: Locale;
  isActive: boolean;
  onPick: () => void;
}) {
  const { t } = useLanguage();

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={isActive}
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border bg-card p-4 text-left transition-colors",
        isActive
          ? "border-primary/60 ring-2 ring-primary/40"
          : "border-slate-800 hover:border-slate-700 hover:bg-slate-800/40",
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-slate-800 text-primary">
          <Languages className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">
            {LANGUAGE_LABELS[locale]}
          </span>
          <span className="mt-0.5 block text-xs uppercase text-slate-500">
            {locale}
          </span>
        </span>
      </span>

      {isActive && (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
          <Check className="h-3 w-3" />
          {t("common.active")}
        </span>
      )}
    </button>
  );
}

function ThemeCard({
  id,
  name,
  tagline,
  swatch,
  isActive,
  onPick,
}: {
  id: ThemeId;
  name: string;
  tagline: string;
  swatch: string;
  isActive: boolean;
  onPick: () => void;
}) {
  const { t } = useLanguage();

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={isActive}
      aria-label={t("settings.appearance.useTheme", { name })}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 text-left transition-colors",
        isActive
          ? "border-primary/60 ring-2 ring-primary/40"
          : "border-slate-800 hover:border-slate-700 hover:bg-slate-800/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          aria-hidden
          className="h-8 w-8 shrink-0 rounded-full"
          style={{
            background: swatch,
            boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.15)",
          }}
        />
        {isActive && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
            <Check className="h-3 w-3" />
            {t("common.active")}
          </span>
        )}
      </div>
      <div>
        <div className="text-sm font-semibold text-white">{name}</div>
        <div className="mt-1 text-xs leading-relaxed text-slate-400">
          {tagline}
        </div>
      </div>
      <div className="mt-1 flex h-2 overflow-hidden rounded-full" aria-hidden>
        <span className="flex-1" style={{ background: swatch }} />
        <span className="w-3 bg-slate-700" />
        <span className="w-3 bg-slate-800" />
        <span className="w-3 bg-slate-900" />
      </div>
      <span className="sr-only">
        {t("settings.appearance.themeId", { id })}
      </span>
    </button>
  );
}
