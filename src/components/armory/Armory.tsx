"use client";

import { Brain, Calendar, Eye, Focus, Mic, ScanEye, Sparkles, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ToolStatus = "Ready" | "Open" | "Closed" | "Running" | "Idle";

type ArmoryProps = {
  model: string;
  eyesOn: boolean;
  focusLabel: string | null;
  onClose: () => void;
  onVault: () => void;
  onCalendar: () => void;
  onFocus: () => void;
  onEyes: () => void;
  onLook: () => void;
};

export function Armory({ model, eyesOn, focusLabel, onClose, onVault, onCalendar, onFocus, onEyes, onLook }: ArmoryProps) {
  const tools: readonly {
    name: string;
    detail: string;
    status: ToolStatus;
    icon: LucideIcon;
    onPress: (() => void) | null;
  }[] = [
    {
      name: "Vault",
      detail: "Notes on this computer. Pull one up by its file name.",
      status: "Ready",
      icon: Brain,
      onPress: onVault,
    },
    {
      name: "Calendar",
      detail: "Bookings saved on this computer. No outside account.",
      status: "Ready",
      icon: Calendar,
      onPress: onCalendar,
    },
    {
      name: "Focus",
      detail: focusLabel ? `Running. ${focusLabel} left.` : "A quiet timer. Press to start 25 minutes.",
      status: focusLabel ? "Running" : "Idle",
      icon: Focus,
      onPress: onFocus,
    },
    {
      name: "Eyes",
      detail: "The camera stays off until you allow it.",
      status: eyesOn ? "Open" : "Closed",
      icon: Eye,
      onPress: onEyes,
    },
    {
      name: "Screen",
      detail: "One look at the screen. I do not click anything.",
      status: "Ready",
      icon: ScanEye,
      onPress: onLook,
    },
    {
      name: "Voice",
      detail: `Speaking through ${model}. The computer speaker is the fallback.`,
      status: "Ready",
      icon: Mic,
      onPress: null,
    },
    {
      name: "Reflex",
      detail: "Scores a request before I answer.",
      status: "Ready",
      icon: Sparkles,
      onPress: null,
    },
  ];

  return (
    <Card
      data-testid="armory"
      data-armory="open"
      className="max-h-[70vh] overflow-auto border border-[color:var(--hud)]/40 bg-black/80 text-[var(--hud-ink)] ring-[color:var(--hud)]/30"
    >
      <CardHeader>
        <CardTitle className="font-mono text-xs tracking-[0.22em] text-[var(--hud)] uppercase">Armory</CardTitle>
        <CardDescription className="text-[var(--hud-dim)]">Tools on this computer. Press one, or say its name.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {tools.map((tool) => {
            const Icon = tool.icon;
            const row = (
              <>
                <Icon className="mt-0.5 size-4 shrink-0 text-[var(--hud)]" aria-hidden="true" />
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{tool.name}</p>
                    <Badge variant="outline" className="border-[color:var(--hud)]/40 text-[10px] text-[var(--hud)]">
                      {tool.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--hud-dim)]">{tool.detail}</p>
                </div>
              </>
            );
            return (
              <li key={tool.name}>
                {tool.onPress ? (
                  <button
                    type="button"
                    onClick={tool.onPress}
                    className="flex w-full items-start gap-3 rounded-lg border border-transparent px-1 py-1 hover:border-[color:var(--hud)]/40"
                  >
                    {row}
                  </button>
                ) : (
                  <div className="flex items-start gap-3 px-1 py-1">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          className="border-[color:var(--hud)]/50 text-[var(--hud)]"
        >
          Close
        </Button>
      </CardContent>
    </Card>
  );
}
