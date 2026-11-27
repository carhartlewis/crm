export interface NameParts {
  readonly firstName: string;
  readonly lastName: string;
}

/** better-auth keeps one name; the first word is the first name, the rest the last name. */
export function nameParts(name: string): NameParts {
  const [firstName = "", ...rest] = name.trim().split(/\s+/);

  return { firstName, lastName: rest.join(" ") };
}

export function fullName({ firstName, lastName }: NameParts) {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}
