# Release checklist

QA Mission Control is licensed under the [MIT License](../LICENSE).
Retain the application license and applicable third-party notices in distributions.

Before publishing a release:

- Run the verification commands in [setup](setup.md), including the complete
  browser suite from a clean dependency installation.
- Review source, fixtures, documentation and assets for sensitive data. Include
  only intentional files; exclude local configuration and generated output.
- Confirm the Northstar zero-key journey and current screenshots.
- Include the MIT license and retain third-party notices.
- Review dependency advisories and configure private vulnerability reporting.
- Require the `verify` job from **Verify product** for changes to the default branch.
  Keep Actions permissions read-only and protect against force pushes/deletions.

The product description is: **Turn complex specifications into accountable,
traceable QA coverage.** Relevant topics include quality assurance, requirements
engineering, traceability, human-in-the-loop review, React and TypeScript.

A static demonstration should use synthetic Northstar data and no provider keys.
An AI-enabled hosted service requires authentication, request limits and spending
controls beyond this local application. See [security](../SECURITY.md).
