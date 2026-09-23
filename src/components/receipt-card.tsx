import type { Receipt, ReceiptStatus } from "@/lib/types";

const STATUS_COLOR: Record<ReceiptStatus, string> = {
  done: "var(--moss)",
  demo: "var(--ember)",
  failed: "var(--clay)",
  stub: "var(--ember)",
  declined: "var(--clay)",
  blocked: "var(--clay)",
};

function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function ReceiptCard({ receipt }: { receipt: Receipt }) {
  const rows = Object.entries(receipt.input).filter(([, value]) => value.trim() !== "");

  return (
    <article className="receipt" data-status={receipt.status} style={{ borderLeftColor: STATUS_COLOR[receipt.status] }}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[0.68rem] tracking-[0.16em] text-muted-foreground uppercase">Receipt</p>
        <p className="receipt-status" style={{ color: STATUS_COLOR[receipt.status] }}>
          {receipt.status}
        </p>
      </div>
      <h3 className="mt-2 font-mono text-sm">{receipt.tool}</h3>
      <p className="text-sm text-muted-foreground">{receipt.title}</p>
      {rows.length > 0 ? (
        <dl className="mt-3 space-y-1">
          {rows.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 text-sm">
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="mt-3 text-sm leading-6 whitespace-pre-wrap">{receipt.outcome}</p>
      <time className="mt-3 block text-xs text-muted-foreground" dateTime={receipt.at}>
        {formatStamp(receipt.at)}
      </time>
    </article>
  );
}
