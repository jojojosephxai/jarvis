import { Button } from "@/components/ui/button";
import { safeHttpUrl } from "@/lib/http-url";
import type { HandPlan } from "@/lib/types";

function gateLabel(plan: HandPlan): string {
  if (plan.state === "declined") return "You said no";
  if (plan.gate === "auto") return "Auto-approved";
  if (plan.state === "approved") return "You said yes";
  return "Needs your yes";
}

export function PlanCard({
  plan,
  pending,
  onDecide,
}: {
  plan: HandPlan;
  pending: boolean;
  onDecide?: (decision: "yes" | "no") => void;
}) {
  const href = safeHttpUrl(plan.input.url);
  const waiting = plan.state === "waiting" && plan.gate === "confirm" && onDecide;

  return (
    <article
      className="rounded-[0.9rem] border border-border border-l-[3px] bg-[#221e1a] px-4 pt-3.5 pb-4 text-left"
      style={{ borderLeftColor: waiting ? "var(--clay)" : "var(--ember)" }}
      data-plan-state={plan.state}
      data-plan-gate={plan.gate}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[0.68rem] tracking-[0.16em] text-muted-foreground uppercase">Plan</p>
        <p className="text-[0.68rem] tracking-[0.16em] text-muted-foreground uppercase">{gateLabel(plan)}</p>
      </div>
      <h3 className="mt-2 font-mono text-sm">{plan.tool}</h3>
      <p className="text-sm text-muted-foreground">{plan.title}</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-6">
        {plan.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {href ? (
        <p className="mt-3 text-sm">
          <a className="underline underline-offset-4" href={href} target="_blank" rel="noopener noreferrer">
            Open this link yourself
          </a>
          <span className="text-muted-foreground"> — the hand does not open it.</span>
        </p>
      ) : null}
      {waiting ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            className="h-11 flex-1 px-3 text-sm"
            disabled={pending}
            onClick={() => onDecide("yes")}
          >
            Yes, do it
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 px-3 text-sm"
            disabled={pending}
            onClick={() => onDecide("no")}
          >
            No, don&apos;t
          </Button>
        </div>
      ) : null}
    </article>
  );
}
