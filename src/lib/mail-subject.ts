const SUBJECT_PREFIX = /^(re:|fwd?:|fw:)\s*/i;

/** Remove repeated Re:/Fwd:/Fw: prefixes for display and normalization. */
export function stripSubjectPrefixes(subject: string): string {
  let s = subject.trim();
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(SUBJECT_PREFIX, "").trim();
  }
  return s;
}

/** Single canonical reply subject (one `Re:`) based on the parent line. */
export function normalizeReplySubject(parentSubject: string): string {
  const base = stripSubjectPrefixes(parentSubject);
  return base ? `Re: ${base}` : "Re:";
}

/** Forward subject without stacking Fwd:/Re: noise. */
export function normalizeForwardSubject(subject: string): string {
  const base = stripSubjectPrefixes(subject);
  return base ? `Fwd: ${base}` : "Fwd:";
}
