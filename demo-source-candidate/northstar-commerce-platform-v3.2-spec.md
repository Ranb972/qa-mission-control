# Northstar Commerce Platform — Unified Product Requirements & System Specification
**Version:** 3.2  
**Status:** Synthetic demonstration specification  
**Intended use:** QA Mission Control deterministic demo and public portfolio showcase

> **Synthetic-data notice:** This document is entirely fictional. It contains no real customer, employer, vendor, proprietary, or production information.

## 0. Purpose

Northstar Commerce Platform is a fictional multi-region commerce product designed to exercise QA Mission Control end to end.

The intended showcase journey is:

**Source → Requirement → Canonical Evidence → Coverage → QA Review → Test Case → Execution → Defect / Risk → Release Decision → Change Impact**

The primary demo requirement is:

> **NCP-CHK-005 — Duplicate confirmation clicks must create at most one order.**

The deterministic demo should link that source evidence to multiple QA tests, record at least one failing execution, surface a synthetic defect and show the release consequence.

### Normative language
- **Must / shall** = required.
- **Should** = expected unless a documented exception applies.
- **Review required** = intentionally ambiguous or conflicting; human QA must decide.

## 1. Product Context

The platform supports shoppers, support teams, finance operators, fulfillment staff, QA engineers, auditors and administrators.

Key dependencies include a payment provider, tax provider, carrier network, notification provider, identity provider and warehouse/inventory services.

External-provider output is not canonical truth until validated by the application.

## 2. Shared State Models

**Order:** Draft → Pending Payment → Confirmed → Allocated → Partially Fulfilled → Fulfilled  
Alternate terminal states: Cancelled, Payment Failed, Refunded, Partially Refunded.

**Payment:** Created → Authorization Pending → Authorized → Capture Pending → Captured  
Alternate states: Declined, Verification Pending, Voided, Refund Pending, Refunded.

**QA review:** Source-backed → Needs review / Blocked by ambiguity → QA approved.

---

## 3. Identity, Authentication & Session Security

This section defines source-backed behavior for **identity, authentication & session security**. It intentionally mixes clear obligations with a small number of review-required items.


### NCP-AUTH-001 — Sign-in privacy
**Classification:** Must/Should per statement
**Requirement:** The platform shall authenticate registered users without revealing whether an unknown account exists.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-AUTH-002 — Failed sign-in throttling
**Classification:** Must/Should per statement
**Requirement:** After five failed sign-in attempts within ten minutes, further attempts shall be throttled.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-AUTH-003 — Password reset expiry
**Classification:** Must/Should per statement
**Requirement:** Password-reset links shall expire 30 minutes after issuance and immediately after successful use.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-AUTH-004 — Privileged MFA
**Classification:** Must/Should per statement
**Requirement:** Administrators and finance operators shall complete a second-factor challenge before privileged access.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-AUTH-005 — Session timeout
**Classification:** Must/Should per statement
**Requirement:** Customer sessions shall expire after 30 minutes of inactivity.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-AUTH-006 — Server-side authorization
**Classification:** Must/Should per statement
**Requirement:** Every privileged mutation shall be authorized server-side and shall not rely on UI visibility.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.

---

## 4. Catalog, Search & Pricing

This section defines source-backed behavior for **catalog, search & pricing**. It intentionally mixes clear obligations with a small number of review-required items.


### NCP-CAT-001 — Catalog visibility
**Classification:** Must/Should per statement
**Requirement:** Only active products available in the shopper's market shall appear in purchase flows.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-CAT-002 — Price consistency
**Classification:** Must/Should per statement
**Requirement:** Catalog, cart and checkout shall use one effective price version for a checkout attempt.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-CAT-003 — Variant selection
**Classification:** Must/Should per statement
**Requirement:** A sellable variant shall be selected before a configurable product is added to cart.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-CAT-004 — Regional pricing
**Classification:** Must/Should per statement
**Requirement:** Prices shall resolve from the shopper's market and currency before promotions are applied.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-CAT-005 — Price-change notice
**Classification:** Must/Should per statement
**Requirement:** A changed price shall be shown to the shopper before final order confirmation.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-CAT-006 — Search determinism
**Classification:** Must/Should per statement
**Requirement:** Identical query, market and index-version inputs should produce stable ranking.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.

---

## 5. Cart & Reservation

This section defines source-backed behavior for **cart & reservation**. It intentionally mixes clear obligations with a small number of review-required items.


### NCP-CART-001 — Cart ownership
**Classification:** Must/Should per statement
**Requirement:** A shopper shall not read or mutate another shopper's cart.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-CART-002 — Guest continuity
**Classification:** Must/Should per statement
**Requirement:** A guest cart may survive refresh and merge after sign-in when constraints remain valid.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-CART-003 — Quantity validation
**Classification:** Must/Should per statement
**Requirement:** Cart quantity shall be a positive integer and obey configured per-line limits.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-CART-004 — Stock reservation
**Classification:** Must/Should per statement
**Requirement:** Checkout initiation shall reserve sellable stock for 15 minutes while payment is pending.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-CART-005 — Reservation release
**Classification:** Must/Should per statement
**Requirement:** Expired reservations shall return stock unless an active authorization is still completing.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-CART-006 — Reservation ambiguity
**Classification:** Review required
**Requirement:** A warehouse note refers to a 20-minute window for manual orders; precedence is not specified.

**Acceptance notes**
- Expose the uncertainty for human QA review.
- Do not invent missing values or precedence rules.
- Dependent QA artifacts remain reviewable rather than automatically approved.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.

---

## 6. Checkout & Order Creation

This section defines source-backed behavior for **checkout & order creation**. It intentionally mixes clear obligations with a small number of review-required items.


### NCP-CHK-001 — Checkout prerequisites
**Classification:** Must/Should per statement
**Requirement:** Checkout shall require a non-empty cart, valid market, supported currency and fulfillable lines.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-CHK-002 — Address validation
**Classification:** Must/Should per statement
**Requirement:** Required shipping and billing address fields shall be valid before payment submission.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-CHK-003 — Tax recalculation
**Classification:** Must/Should per statement
**Requirement:** Changing shipping jurisdiction shall recalculate tax before confirmation.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-CHK-004 — Final review
**Classification:** Must/Should per statement
**Requirement:** The shopper shall see final items, discounts, tax, shipping and total before confirmation.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-CHK-005 — Duplicate confirmation
**Classification:** Must/Should per statement
**Requirement:** Duplicate confirmation clicks must create at most one order.

**Acceptance notes**
- Two rapid confirmation requests using the same logical identity persist one commercial order.
- A replay returns the existing order identity rather than creating another order.
- Only one confirmation notification is emitted.
- A delayed first response followed by retry remains safe.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-CHK-006 — Failure recovery
**Classification:** Must/Should per statement
**Requirement:** If order creation fails after payment authorization, the system shall expose a recoverable state and must not silently create a second order.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.

---

## 7. Order Lifecycle & State

This section defines source-backed behavior for **order lifecycle & state**. It intentionally mixes clear obligations with a small number of review-required items.


### NCP-ORD-001 — Immutable order ID
**Classification:** Must/Should per statement
**Requirement:** Each order shall receive a unique immutable identifier.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-ORD-002 — State integrity
**Classification:** Must/Should per statement
**Requirement:** Order transitions shall follow the documented state model and reject invalid backward transitions.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-ORD-003 — Customer cancellation
**Classification:** Must/Should per statement
**Requirement:** An eligible unfulfilled order may be cancelled by the customer within 30 minutes.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-ORD-004 — Partial fulfillment
**Classification:** Must/Should per statement
**Requirement:** An order may contain multiple fulfillment groups with independent shipment status.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-ORD-005 — Order history
**Classification:** Must/Should per statement
**Requirement:** Customers shall see their own order history with status, totals and refund state.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-ORD-006 — Late events
**Classification:** Must/Should per statement
**Requirement:** Out-of-order fulfillment events shall not regress a terminal order state.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.

---

## 8. Payments, Idempotency & Reconciliation

This section defines source-backed behavior for **payments, idempotency & reconciliation**. It intentionally mixes clear obligations with a small number of review-required items.


### NCP-PAY-001 — Payment intent
**Classification:** Must/Should per statement
**Requirement:** Checkout shall create or reuse one payment intent per logical confirmation attempt.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-PAY-002 — Idempotent authorization
**Classification:** Must/Should per statement
**Requirement:** Retries using the same idempotency key shall not create duplicate charges.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-PAY-003 — Decline handling
**Classification:** Must/Should per statement
**Requirement:** A declined payment shall preserve the cart and clearly state that no order was created.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-PAY-004 — Timeout handling
**Classification:** Must/Should per statement
**Requirement:** A payment timeout shall enter verification-pending rather than retry with a new identity.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-PAY-005 — Refund linkage
**Classification:** Must/Should per statement
**Requirement:** Every refund shall remain linked to the original charge and order.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-PAY-006 — Reconciliation
**Classification:** Must/Should per statement
**Requirement:** Daily reconciliation shall surface unmatched charges, captures, refunds and orders.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.

---

## 9. Promotions & Discounts

This section defines source-backed behavior for **promotions & discounts**. It intentionally mixes clear obligations with a small number of review-required items.


### NCP-PROMO-001 — Eligibility
**Classification:** Must/Should per statement
**Requirement:** Promotions shall apply only when configured market, product, customer and date conditions are satisfied.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-PROMO-002 — Single-use code
**Classification:** Must/Should per statement
**Requirement:** A per-customer single-use code shall not be redeemed successfully more than once.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-PROMO-003 — Stacking
**Classification:** Must/Should per statement
**Requirement:** Incompatible promotions shall not stack; configured priority shall determine the winner.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-PROMO-004 — Total floor
**Classification:** Must/Should per statement
**Requirement:** Discounts shall not reduce subtotal below zero.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-PROMO-005 — Recalculation
**Classification:** Must/Should per statement
**Requirement:** Removing an eligible cart item shall remove or recalculate dependent promotions.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-PROMO-006 — Loyalty ambiguity
**Classification:** Review required
**Requirement:** The precedence between loyalty credits and campaign coupons is not defined.

**Acceptance notes**
- Expose the uncertainty for human QA review.
- Do not invent missing values or precedence rules.
- Dependent QA artifacts remain reviewable rather than automatically approved.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.

---

## 10. Inventory & Availability

This section defines source-backed behavior for **inventory & availability**. It intentionally mixes clear obligations with a small number of review-required items.


### NCP-INV-001 — Sellable quantity
**Classification:** Must/Should per statement
**Requirement:** Available-to-sell shall exclude active reservations and committed fulfillment quantity.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-INV-002 — Oversell prevention
**Classification:** Must/Should per statement
**Requirement:** Order confirmation shall fail if stock cannot be atomically reserved or committed.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-INV-003 — Backorder policy
**Classification:** Must/Should per statement
**Requirement:** Backorder may exceed physical stock only when explicitly permitted for SKU and market.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-INV-004 — Reservation expiry
**Classification:** Must/Should per statement
**Requirement:** Standard checkout reservations shall expire 15 minutes after creation.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-INV-005 — Manual correction
**Classification:** Must/Should per statement
**Requirement:** Inventory corrections shall require authorization and an audit reason.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-INV-006 — Manual-order conflict
**Classification:** Review required
**Requirement:** The warehouse runbook says manual orders reserve stock for 20 minutes, conflicting with the standard 15-minute rule.

**Acceptance notes**
- Expose the uncertainty for human QA review.
- Do not invent missing values or precedence rules.
- Dependent QA artifacts remain reviewable rather than automatically approved.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.

---

## 11. Shipping & Fulfillment

This section defines source-backed behavior for **shipping & fulfillment**. It intentionally mixes clear obligations with a small number of review-required items.


### NCP-SHIP-001 — Method eligibility
**Classification:** Must/Should per statement
**Requirement:** Shipping methods shall be filtered by destination, restrictions, value and carrier support.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-SHIP-002 — Rate refresh
**Classification:** Must/Should per statement
**Requirement:** Shipping cost shall refresh when destination or fulfillable cart contents change.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-SHIP-003 — Tracking persistence
**Classification:** Must/Should per statement
**Requirement:** Tracking numbers shall remain linked to the shipment that produced them.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-SHIP-004 — Partial shipment
**Classification:** Must/Should per statement
**Requirement:** Customers should see each shipment independently when an order is split.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-SHIP-005 — Event ordering
**Classification:** Must/Should per statement
**Requirement:** Duplicate or late carrier events shall not regress a delivered shipment.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-SHIP-006 — Cutoff ambiguity
**Classification:** Review required
**Requirement:** The term business-day cutoff does not define the authoritative timezone for multi-region warehouses.

**Acceptance notes**
- Expose the uncertainty for human QA review.
- Do not invent missing values or precedence rules.
- Dependent QA artifacts remain reviewable rather than automatically approved.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.

---

## 12. Tax & Regulatory Calculation

This section defines source-backed behavior for **tax & regulatory calculation**. It intentionally mixes clear obligations with a small number of review-required items.


### NCP-TAX-001 — Tax input
**Classification:** Must/Should per statement
**Requirement:** Tax shall use final taxable items, discounts, shipping and destination jurisdiction.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-TAX-002 — Jurisdiction change
**Classification:** Must/Should per statement
**Requirement:** Changing destination jurisdiction shall invalidate prior tax results.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-TAX-003 — Rounding
**Classification:** Must/Should per statement
**Requirement:** Tax rounding shall follow configured currency precision and jurisdiction rules.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-TAX-004 — Provider failure
**Classification:** Must/Should per statement
**Requirement:** A tax-provider failure shall block confirmation unless an approved fallback exists.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-TAX-005 — Tax evidence
**Classification:** Must/Should per statement
**Requirement:** Orders should preserve enough calculation detail to explain final tax.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-TAX-006 — Fallback ambiguity
**Classification:** Review required
**Requirement:** The specification references approved fallback markets but does not enumerate them.

**Acceptance notes**
- Expose the uncertainty for human QA review.
- Do not invent missing values or precedence rules.
- Dependent QA artifacts remain reviewable rather than automatically approved.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.

---

## 13. Returns & Refunds

This section defines source-backed behavior for **returns & refunds**. It intentionally mixes clear obligations with a small number of review-required items.


### NCP-REF-001 — Return eligibility
**Classification:** Must/Should per statement
**Requirement:** Return eligibility shall consider category, fulfillment date, order state and policy window.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-REF-002 — Standard window
**Classification:** Must/Should per statement
**Requirement:** Standard eligible products may be returned within 30 calendar days of delivery.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-REF-003 — Marketplace ambiguity
**Classification:** Review required
**Requirement:** Marketplace products follow seller policy; no universal fallback window is defined.

**Acceptance notes**
- Expose the uncertainty for human QA review.
- Do not invent missing values or precedence rules.
- Dependent QA artifacts remain reviewable rather than automatically approved.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-REF-004 — Refund ceiling
**Classification:** Must/Should per statement
**Requirement:** Refunds shall not exceed captured amount minus prior successful refunds.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-REF-005 — Partial refund
**Classification:** Must/Should per statement
**Requirement:** Authorized agents may issue partial refunds with a reason code.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-REF-006 — Refund failure
**Classification:** Must/Should per statement
**Requirement:** Provider refund failure shall remain unresolved and shall not be recorded as completed.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.

---

## 14. Notifications & Messaging

This section defines source-backed behavior for **notifications & messaging**. It intentionally mixes clear obligations with a small number of review-required items.


### NCP-NOTIF-001 — Order confirmation
**Classification:** Must/Should per statement
**Requirement:** Successful order creation shall enqueue one order-confirmation notification.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-NOTIF-002 — Shipment notice
**Classification:** Must/Should per statement
**Requirement:** A shipment notification should be generated when valid tracking is first available.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-NOTIF-003 — Refund notice
**Classification:** Must/Should per statement
**Requirement:** Customers should be notified after a refund reaches completed state.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-NOTIF-004 — Deduplication
**Classification:** Must/Should per statement
**Requirement:** Replayed domain events shall not create duplicate customer notifications.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-NOTIF-005 — Consent
**Classification:** Must/Should per statement
**Requirement:** Optional marketing messages shall respect current customer consent.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-NOTIF-006 — Transactional override
**Classification:** Must/Should per statement
**Requirement:** Required transactional notices shall not depend on marketing consent.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.

---

## 15. Administration & Support Operations

This section defines source-backed behavior for **administration & support operations**. It intentionally mixes clear obligations with a small number of review-required items.


### NCP-ADMIN-001 — Customer lookup
**Classification:** Must/Should per statement
**Requirement:** Support users shall search customers using approved identifiers and never expose full payment credentials.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-ADMIN-002 — Order lookup
**Classification:** Must/Should per statement
**Requirement:** Support users shall retrieve orders using permitted identifiers.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-ADMIN-003 — Privileged actions
**Classification:** Must/Should per statement
**Requirement:** Refund, cancellation, manual adjustment and stock correction shall require explicit authorization.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-ADMIN-004 — Reason required
**Classification:** Must/Should per statement
**Requirement:** High-impact manual actions shall require a non-empty reason.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-ADMIN-005 — Sensitive masking
**Classification:** Must/Should per statement
**Requirement:** Sensitive fields shall be masked according to role.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-ADMIN-006 — Bulk safety
**Classification:** Must/Should per statement
**Requirement:** Bulk operations should show preview, scope count and explicit confirmation.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.

---

## 16. Audit, Security & Privacy

This section defines source-backed behavior for **audit, security & privacy**. It intentionally mixes clear obligations with a small number of review-required items.


### NCP-AUD-001 — Audit trail
**Classification:** Must/Should per statement
**Requirement:** Critical changes shall record actor identity, nature of change, date/time and target entity.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-AUD-002 — Immutable event ID
**Classification:** Must/Should per statement
**Requirement:** Audit-event identifiers shall be immutable.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-AUD-003 — Audit access
**Classification:** Must/Should per statement
**Requirement:** Only authorized roles shall access detailed audit records.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-AUD-004 — PII minimization
**Classification:** Must/Should per statement
**Requirement:** Audit logs shall avoid secrets and unnecessary personal data.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-AUD-005 — Retention
**Classification:** Must/Should per statement
**Requirement:** Operational audit records should be retained for 24 months unless stricter rules apply.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-AUD-006 — Review cadence ambiguity
**Classification:** Review required
**Requirement:** Privileged access should be reviewed periodically, but no interval is defined.

**Acceptance notes**
- Expose the uncertainty for human QA review.
- Do not invent missing values or precedence rules.
- Dependent QA artifacts remain reviewable rather than automatically approved.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.

---

## 17. API Contracts

This section defines source-backed behavior for **api contracts**. It intentionally mixes clear obligations with a small number of review-required items.


### NCP-API-001 — API authentication
**Classification:** Must/Should per statement
**Requirement:** Protected endpoints shall reject missing or invalid credentials before business mutation.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-API-002 — Correlation ID
**Classification:** Must/Should per statement
**Requirement:** Requests should accept or generate a correlation identifier.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-API-003 — Idempotency key
**Classification:** Must/Should per statement
**Requirement:** Order-confirmation and payment-mutation APIs shall support an idempotency key.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-API-004 — Validation errors
**Classification:** Must/Should per statement
**Requirement:** Invalid input should return structured field-level errors.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-API-005 — Pagination
**Classification:** Must/Should per statement
**Requirement:** Collection APIs shall use bounded deterministic pagination.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-API-006 — Rate limits
**Classification:** Must/Should per statement
**Requirement:** Public APIs shall enforce configured rate limits and return a clear retry signal.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.

---

## 18. Reliability, Recovery & Continuity

This section defines source-backed behavior for **reliability, recovery & continuity**. It intentionally mixes clear obligations with a small number of review-required items.


### NCP-REL-001 — Backup
**Classification:** Must/Should per statement
**Requirement:** Critical application data shall be backed up according to recovery policy.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-REL-002 — Restore
**Classification:** Must/Should per statement
**Requirement:** Authorized operators shall be able to restore supported backups in a controlled environment.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-REL-003 — Restartable jobs
**Classification:** Must/Should per statement
**Requirement:** Long-running jobs shall restart without duplicating committed business effects.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-REL-004 — Unexpected failure recovery
**Classification:** Must/Should per statement
**Requirement:** After infrastructure failure, persisted order/payment state shall recover without duplicate records.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-REL-005 — Retry safety
**Classification:** Must/Should per statement
**Requirement:** Transient mutation retries shall be bounded and idempotent.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-REL-006 — Queue replay
**Classification:** Must/Should per statement
**Requirement:** Message replay shall not reapply effects already recorded for the same event identity.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.

---

## 19. Performance & Capacity

This section defines source-backed behavior for **performance & capacity**. It intentionally mixes clear obligations with a small number of review-required items.


### NCP-PERF-001 — Checkout timeout
**Classification:** Must/Should per statement
**Requirement:** Checkout shall expose timeout/recovery behavior instead of indefinite loading.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-PERF-002 — Large cart
**Classification:** Must/Should per statement
**Requirement:** The system should support at least 100 distinct cart lines for supported customer types.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-PERF-003 — Concurrent checkout
**Classification:** Must/Should per statement
**Requirement:** Concurrent confirmation attempts for one cart shall preserve idempotent order creation.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-PERF-004 — Batch progress
**Classification:** Must/Should per statement
**Requirement:** Administrative batch operations should process in bounded chunks and expose progress.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-PERF-005 — Graceful degradation
**Classification:** Must/Should per statement
**Requirement:** Non-critical recommendation or analytics failures shall not block checkout.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-PERF-006 — Performance ambiguity
**Classification:** Review required
**Requirement:** The document references an interactive latency target but does not define the numeric SLA.

**Acceptance notes**
- Expose the uncertainty for human QA review.
- Do not invent missing values or precedence rules.
- Dependent QA artifacts remain reviewable rather than automatically approved.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.

---

## 20. Accessibility & Localization

This section defines source-backed behavior for **accessibility & localization**. It intentionally mixes clear obligations with a small number of review-required items.


### NCP-ACC-001 — Keyboard operation
**Classification:** Must/Should per statement
**Requirement:** Core customer and administrative workflows shall be operable by keyboard.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-ACC-002 — Focus visibility
**Classification:** Must/Should per statement
**Requirement:** Interactive controls shall expose visible keyboard focus.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-ACC-003 — Accessible names
**Classification:** Must/Should per statement
**Requirement:** Controls shall expose meaningful accessible names.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-ACC-004 — Error association
**Classification:** Must/Should per statement
**Requirement:** Validation errors should be associated with affected fields and summarized when appropriate.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-ACC-005 — Locale formatting
**Classification:** Must/Should per statement
**Requirement:** Dates, currency and numbers shall follow selected locale while preserving canonical values.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-ACC-006 — RTL support
**Classification:** Must/Should per statement
**Requirement:** Supported RTL locales should not break essential layout or interaction order.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.

---

## 21. Release Readiness & Quality Gates

This section defines source-backed behavior for **release readiness & quality gates**. It intentionally mixes clear obligations with a small number of review-required items.


### NCP-READY-001 — Release evidence
**Classification:** Must/Should per statement
**Requirement:** Release assessment shall distinguish executions, defects, risks and unassessed scope.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-READY-002 — Awaiting run
**Classification:** Must/Should per statement
**Requirement:** Tests without a recorded execution shall not be counted as passed.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-READY-003 — Blocking defects
**Classification:** Must/Should per statement
**Requirement:** Open release-blocking defects shall prevent a Ready decision.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-READY-004 — Risk visibility
**Classification:** Must/Should per statement
**Requirement:** High or critical unresolved risks shall remain visible.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-READY-005 — Human decision
**Classification:** Must/Should per statement
**Requirement:** Final release approval shall require an explicit human QA decision.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.


### NCP-READY-006 — No fake percentage
**Classification:** Must/Should per statement
**Requirement:** No overall product-coverage percentage shall be shown without a defensible denominator.

**Acceptance notes**
- The outcome must be observable in product behavior or an explicit persisted record.
- At least one relevant negative/boundary path should be testable.
- Role, state and input constraints must remain explicit.

**QA considerations**
- Preserve direct source evidence when linking QA work.
- Do not promote examples or metadata into requirements.
- Keep ambiguity visible rather than silently resolving it.
---
## 23. Role & Permission Matrix

| Capability | Shopper | Support | Finance | Fulfillment | QA | Auditor | Admin |
|---|---:|---:|---:|---:|---:|---:|---:|
| View own order | Yes | Scoped | Scoped | Scoped | Demo/QA | Read only | Yes |
| Cancel order | Eligible | Scoped | No | No | No | No | Yes |
| Issue refund | No | Limited | Yes | No | No | No | Yes |
| Correct inventory | No | No | No | Yes | No | Read only | Yes |
| Review QA evidence | No | No | No | No | Yes | Read only | Yes |
| Final release decision | No | No | No | No | Yes | Read only | No |

## 24. Error & Recovery Catalog

| Code | Condition | Expected behavior |
|---|---|---|
| ORD_DUP_GUARD | Duplicate confirmation replay | Return existing order; never create a second order |
| PAY_TIMEOUT | Provider timeout | Verification pending; reconcile before new identity |
| TAX_UNAVAILABLE | Tax provider unavailable | Block or use explicitly approved fallback |
| INV_CONFLICT | Stock unavailable | Explain unavailable line and recalculate |
| REF_PROVIDER_FAIL | Refund provider failure | Keep unresolved; controlled retry |
| AUTH_THROTTLED | Login threshold exceeded | Generic retry response |

## 25. Deliberate Ambiguities & Conflicts

1. Standard inventory reservation is 15 minutes; a manual-order note says 20 minutes.
2. Marketplace returns have seller-specific policy with no universal fallback.
3. Warehouse cutoff timezone is unspecified.
4. Tax fallback markets are referenced but not listed.
5. Loyalty-credit versus coupon precedence is unspecified.
6. Privileged-access review is "periodic" without a defined interval.
7. Interactive latency is referenced without a numeric SLA.

**Expected QA behavior:** expose these as review-required or blocked. Never invent certainty.

## 26. Canonical Demo Anchors

| Anchor | Requirement | Showcase value |
|---|---|---|
| DEMO-A | NCP-CHK-005 | Duplicate-order prevention / idempotency |
| DEMO-B | NCP-PAY-002 | Duplicate-charge prevention |
| DEMO-C | NCP-AUD-001 | Audit trail and provenance |
| DEMO-D | NCP-REL-004 | Recovery after failure |
| DEMO-E | NCP-INV-006 | Intentional conflict |
| DEMO-F | NCP-READY-005 | Explicit human release decision |

### Recommended deterministic execution story

For **NCP-CHK-005**, seed:
1. Single confirmation creates one order — **Passed**
2. Rapid double click returns same order — **Failed**
3. Retry after client timeout does not duplicate order — **Awaiting run**
4. Event replay sends no duplicate confirmation — **Passed**

Synthetic defect:
**BUG-DEMO-001 — Rapid double submit can create a second order under delayed client response**

The target demo release should remain **At Risk** until QA reviews the failure and related high-risk signal.

## 27. Release Readiness Rules

- **Passed** requires an explicit recorded pass.
- **Awaiting run** must never count as passed.
- Open release blockers or unresolved high risks prevent a Ready decision.
- Missing linked source evidence must stay visible.
- Final approval remains a human QA decision.
- The report should explain the verdict and recommended next actions.

## 28. Glossary

| Term | Meaning |
|---|---|
| Canonical evidence | App-owned source span supporting a requirement |
| Coverage | QA work linked to source-backed behavior |
| Review required | Human clarification is needed |
| Idempotency | Repeating one logical mutation does not duplicate business effects |
| Release readiness | Explainable quality state from evidence, executions, defects, risks and QA judgment |
| Historical evidence | Evidence retained for change/audit context |

## 29. Change Log

| Version | Summary |
|---|---|
| 3.0 | Initial synthetic commerce specification |
| 3.1 | Added recovery, audit and accessibility coverage |
| 3.2 | Added deterministic demo anchors, ambiguity and release-readiness rules |

## 30. End of Specification

This document is synthetic and may be redistributed with the QA Mission Control demo.