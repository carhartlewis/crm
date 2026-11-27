import { contactName, dealStage, formatMoney } from "@crm/core/records";
import { EntityLogo } from "@crm/ui/components/entity-logo";
import { StatusDot } from "@crm/ui/components/status-dot";
import { EmptyCellDash } from "@crm/ui/patterns/empty-cell";
import type { ReactNode } from "react";
import type { Company } from "../../lib/companies.ts";
import type { Contact } from "../../lib/contacts.ts";
import type { Member } from "./use-crm.ts";

type LogoSize = "xs" | "sm" | "default" | "lg" | "xl";

type CompanyMark = Pick<Company, "name" | "icon_url" | "logo_url" | "icon_dark_url" | "icon_tone">;

/** A company's square logo from our storage, or its initials. */
export function CompanyLogo({ company, size = "sm" }: { company: CompanyMark; size?: LogoSize }) {
  return (
    <EntityLogo
      darkSrc={company.icon_dark_url}
      name={company.name}
      size={size}
      src={company.icon_url ?? company.logo_url}
      tone={company.icon_tone}
    />
  );
}

/** A person's picture, or their initials in a circle. */
export function PersonAvatar({
  name,
  src = null,
  size = "default",
}: {
  name: string;
  src?: string | null;
  size?: LogoSize;
}) {
  return <EntityLogo kind="person" name={name} size={size} src={src} />;
}

/** A workspace member's picture, or their initials. */
export function MemberAvatar({ member, size }: { member: Member; size?: LogoSize }) {
  return <PersonAvatar name={member.name} size={size} src={member.image} />;
}

export function ContactAvatar({ contact, size }: { contact: Contact; size?: LogoSize }) {
  return <PersonAvatar name={contactName(contact)} size={size} src={contact.image_url} />;
}

/** A logo (or avatar) and a name on one line that truncates. */
function NameWithMark({ mark, name, strong }: { mark: ReactNode; name: string; strong?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex shrink-0">{mark}</span>
      <span className={strong ? "truncate font-medium" : "truncate text-foreground"}>{name}</span>
    </span>
  );
}

/** A company in a table cell: its logo and name, or a dash. */
export function CompanyCell({ company }: { company: CompanyMark | null | undefined }) {
  if (!company) return <EmptyCellDash />;

  return <NameWithMark mark={<CompanyLogo company={company} size="xs" />} name={company.name} />;
}

/** A workspace member in a table cell: picture and name, or a dash when unassigned. */
export function OwnerCell({ owner }: { owner: Member | null | undefined }) {
  if (!owner) return <EmptyCellDash />;

  return <NameWithMark mark={<MemberAvatar member={owner} size="sm" />} name={owner.name} />;
}

/** A deal stage: its colour and label. */
export function StageLabel({ stage }: { stage: string }) {
  const info = dealStage(stage);

  return (
    <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
      <StatusDot tone={info.tone} />
      <span className="truncate">{info.label}</span>
    </span>
  );
}

/** An amount in its currency, or a dash. */
export function MoneyCell({ amount, currency }: { amount: string | null; currency: string }) {
  const text = formatMoney(amount, currency);

  return text ? <span className="tabular-nums">{text}</span> : <EmptyCellDash />;
}

/** A domain as a link to the site, opened outside the app. */
export function DomainLink({ domain }: { domain: string }) {
  return (
    <a
      className="truncate text-foreground underline decoration-input underline-offset-3 pointer-fine:hover:decoration-foreground"
      href={`https://${domain}`}
      rel="noreferrer noopener"
      target="_blank"
    >
      {domain}
    </a>
  );
}
