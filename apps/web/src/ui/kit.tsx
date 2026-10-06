import type { ReactNode } from "react";
import Icon from "./Icon";
import type { IconName } from "./Icon";

/*
 * The app's component kit: thin React wrappers over the design system's CSS
 * classes (styles/ui.css + styles/app.css). They exist so screens stay
 * consistent; the classes still work on their own.
 */

/** A screen's heading. One h1 per screen; focus moves here when you switch screens. */
export function ScreenHead({ eyebrow, title, children, id }: { eyebrow: string; title: string; children?: ReactNode; id?: string }) {
  return (
    <header className="screen__head">
      <p className="eyebrow"><span className="amp amp--short" aria-hidden="true" />{eyebrow}</p>
      <h1 id={id} tabIndex={-1}>{title}</h1>
      {children && <div className="screen__lede">{children}</div>}
    </header>
  );
}

/** A raised card with a heading row (title on the left, anything on the right). */
export function SectionCard({ title, meta, actions, children, labelledBy, className = "" }: {
  title?: ReactNode; meta?: ReactNode; actions?: ReactNode; children?: ReactNode; labelledBy?: string; className?: string;
}) {
  return (
    <section className={`section-card ${className}`} aria-labelledby={labelledBy}>
      {(title || meta || actions) && (
        <div className="section-card__head">
          <div>{title && <h2 id={labelledBy} className="section-card__title">{title}</h2>}{meta && <p className="section-card__meta">{meta}</p>}</div>
          {actions && <div className="cluster">{actions}</div>}
        </div>
      )}
      {children && <div className="section-card__body">{children}</div>}
    </section>
  );
}

type Tone = "info" | "warn" | "danger" | "gold";
const TONE_ICON: Record<Tone, IconName> = { info: "info", warn: "warn", danger: "warn", gold: "info" };

/** A boxed message. The icon is decorative: the title says what kind of message it is. */
export function Callout({ tone = "info", title, children, role }: { tone?: Tone; title?: ReactNode; children?: ReactNode; role?: "alert" | "status" }) {
  return (
    <div className={`callout callout--${tone}`} role={role}>
      <span className="callout__icon"><Icon name={TONE_ICON[tone]} size={22} /></span>
      <div>{title && <h3 className="callout__title">{title}</h3>}{children}</div>
    </div>
  );
}

/** Status as a word plus a colour — never colour alone. */
export function Badge({ tone = "muted", children, dot = false }: { tone?: "live" | "soon" | "next" | "muted"; children: ReactNode; dot?: boolean }) {
  return <span className={`badge badge--${tone}`}>{dot && <span className={`status-dot status-dot--${tone}`} aria-hidden="true" />}{children}</span>;
}

export function EmptyState({ icon = "note", title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty__icon"><Icon name={icon} size={48} /></span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
