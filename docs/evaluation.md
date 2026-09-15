# Evaluation and limits

QA Mission Control evaluates AI as review material. Passing a schema or matching
source evidence does not prove that a model understood a requirement.

## What is established

Deterministic tests exercise application-owned evidence locations, explicit QA
approval, guarded imports, stale-result rejection, change impact and atomic
workspace restoration. Synthetic browser fixtures exercise 500-page ingestion,
9,000 requirements and a separate large workspace with 30,000 test links.
These prove bounded engineering behaviors, not semantic extraction accuracy.

## Real-document evidence

Existing research used a 380-page specification. Semantic evaluation used
purposively selected bounded regions; it was not a complete-document accuracy
study or a representative random sample. Private source text and source-derived
outputs are excluded from public documentation.

The paced production-contract continuation retained 36 cases and 74 expected
actionable concepts. Among accepted outputs, precision was 47/59 (79.66%) and
strict concept recall was 20/35 (57.14%). Realized yield across the complete
frozen set was 20/74 (27.03%). Rejected or unavailable cases stayed visible in
execution accounting; they did not become successful semantic observations.

Precision could credit faithful partial statements. Strict recall required the
complete action, scope, conditions and result; a quotation could not repair an
incomplete interpretation. These denominators answer different questions.

## Experiments deliberately not shipped

A benchmark-only anchor-reference contract improved some acceptance and concept
yield, but failed its combined safety gate. A subsequent semantic-role contract
was evaluated once on 12 development cases with a fixed model. It accepted 9/12,
realized 16/34 concepts, and scored 32/45 on its predeclared main precision rule.
That rule penalized proposals blocked by unresolved source issues, including
source-supported proposals, so its precision is not a pure fabrication measure.

All 95 accepted findings and 118 evidence spans in that experiment passed
canonical checks, while semantic safety still failed. This is the central
engineering lesson: **correct provenance is necessary and insufficient**.
The development gate stopped the experiment. Its holdout was not run; neither
experimental contract was integrated into production.

Provider availability and document-extraction alternatives were also explored.
They did not justify replacing the established product architecture. Public
claims should not turn a provider snapshot into an availability promise.

## Current limitations

- Live extraction can omit qualifiers, split a duty into incomplete fragments,
  strengthen permissions into obligations, or mishandle tables and ambiguity.
- Exact evidence proves where text came from, not entailment or completeness.
- OCR, scanned pages, diagrams and reading order need human inspection.
- Related-source conflict detection is conservative and cannot find every
  semantic contradiction.
- Recorded executions are QA observations, not an automated test runner.
- Browser storage and exported backups are local plaintext, not a hosted audit
  service, encrypted vault or collaboration system.

The zero-key demo uses synthetic curated data and measures no AI quality.
Live output always requires QA review. **AI suggests. QA approves.**

## Reproducibility

The public synthetic fixtures reproduce product integrity and scale checks.
The real-document results above are aggregate historical observations; their
original dataset is not distributed and these results cannot be reproduced from
the synthetic fixtures. They are not a claim about Northstar extraction accuracy.
