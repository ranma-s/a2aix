export function redactFreeText(value: string): string {
  const withoutEmail = value.replace(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    "[contact-removed]",
  );
  const withoutInternational = withoutEmail.replace(
    /\+81[-\s]?\d{2}[-\s]?\d{4}[-\s]?\d{4}/g,
    "[contact-removed]",
  );
  return withoutInternational.replace(/0\d{1,3}-\d{1,4}-\d{4}/g, "[contact-removed]");
}
