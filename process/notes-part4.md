# Part 4 carry-over — the serialiser switch (ruled, not yet done)

The CLI writes BILL FILES through billToYaml. Register, constitution and other
CLI writes keep js-yaml — they were never part of this problem.

Not for the hash: the substantive hash is computed from parsed content and
never depended on serialisation. The reasons are operational.

1. The diff at the gate. Clerking writes currently re-dump with a different
   dumper, so a page-authored draft is wholly reformatted at submission and the
   reviewer sees style noise burying the one substantive change. This system's
   review culture is "read the diff"; two serialisers poison the diff.
2. The test exercises what runs. The maximal-fixture round-trip currently
   guards a path only the browser takes.

Three conditions land BEFORE the switch:

- Adversarial scalars in the maximal fixture: strings containing ": ", "#",
  quotes, leading and trailing spaces, an empty string, unicode, a line that
  itself looks like YAML syntax, and one very long line. A hand emitter's real
  risk is quoting, not shape.
- Emit idempotence: emit(parse(emit(x))) === emit(x), so successive clerking
  writes do not oscillate formatting.
- Minimal-diff golden test: `bill submit` on a page-authored draft changes only
  number, status and the new history entry.

Also for the process doc's authoring section: any CLI write strips comments.
Emitters emit objects and comments are not in the object. Comments belong in
TEMPLATE.yaml as guidance, never in a bill as record. True under either dumper.
