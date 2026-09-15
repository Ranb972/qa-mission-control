# Northstar Commerce Platform — Release 3.3 Change Notice
**Status:** Synthetic demonstration companion source

> Entirely fictional; safe for a public demo.

## NCP-CHG-001 — Marketplace return fallback
For Release 3.3, marketplace products should default to a **45-day return window** when the seller has not configured a policy.

**Conflict:** v3.2 intentionally defines no universal fallback. QA must review rather than silently choose a winner.

## NCP-CHG-002 — Support-assisted reservation
Standard checkout remains **15 minutes**. Explicit support-assisted manual orders may reserve stock for **20 minutes**.

This resolves the earlier 15/20-minute ambiguity by defining scope.

## NCP-CHG-003 — Duplicate confirmation
The duplicate-confirmation rule is unchanged: one logical confirmation identity must create at most one commercial order.

## NCP-CHG-004 — Payment timeout
A timeout may remain verification-pending for up to five minutes before explicit reconciliation/retry is offered.

## NCP-CHG-005 — Release gate
Any unresolved duplicate-order defect linked to checkout confirmation is release-blocking for Release 3.3.

## Demo intent
Use this companion source to demonstrate:
- multi-source provenance,
- explicit conflict detection,
- localized change impact,
- preservation of unaffected QA work,
- human QA approval.