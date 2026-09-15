# Portfolio case study: accountable QA coverage

## The problem

A specification can contain hundreds of pages, tables, repeated policies and
incomplete statements. A list of plausible AI-generated tests is not enough to
show what was covered, why a test exists or whether changed requirements invalidate
previous QA work.

QA Mission Control makes Requirements explicit and keeps the chain from source
to release inspectable. The product insight is that provenance, review and change
semantics make AI assistance useful even when interpretation quality is uncertain.

## The engineering decisions

Local document ingestion builds canonical source accounting before any provider
request. Browser workers and bounded regions support large specifications without
silently treating a prefix as the whole document. First-class requirements join
coverage and exact test designs to release executions and historical change impact.

The application owns evidence locations and validates source quotes. Models supply
interpretations, not canonical identity or approval. QA explicitly confirms useful
coverage and approves eligible test suggestions. Transactional storage and guarded
restoration protect this chain across failed writes, reloads and source changes.

## What the evidence showed

Existing real-document validation reconstructed a 380-page specification into
1,485 sections and 1,864 bounded units. This demonstrated ingestion and accounting;
it did not establish full-document semantic accuracy. A deliberately selected
36-region / 74-concept evaluation exposed substantial interpretation failures.
Accepted-subset precision was 47/59 and strict recall 20/35; complete-sample realized
yield was 20/74. These denominators are intentionally separate.

Failures included omitted qualifiers, incomplete compound obligations, strengthened
permissions, unsafe interpretation of unresolved material and confusion between
metadata and behavior. Correct mechanical grounding did not prevent them.

Anchor-reference and semantic-role contracts were tested independently rather than
being promoted after a few attractive examples. The later development experiment
passed canonical checks for 95 findings and 118 spans but failed semantic gates.
It stopped before holdout evaluation. Neither contract shipped. Provider comparisons,
LangExtract and targeted Docling exploration also did not justify replacing the
production path: improved selected outputs did not resolve ambiguity, formula loss,
reliability or canonical-mapping concerns.

## The resulting product boundary

AI remains optional and experimental. Curated synthetic data demonstrates the
complete useful workflow without keys or provider luck. The release report can
explain failures, uncovered requirements and unresolved conflicts; it does not
invent a sign-off. Changed source evidence opens impact review rather than silently
carrying forward approval.

This project demonstrates evaluation discipline, application-owned provenance,
human approval, accountable failure reporting and a local workflow that survives
provider unavailability. It does not claim perfect extraction, hosted compliance,
automated execution or multi-user collaboration. Large transfers remain slow;
scans and diagrams still need human review.

See [architecture](architecture.md), [evaluation](evaluation.md),
[performance](../PERFORMANCE.md) and the [deterministic demo](demo.md).
