---
name: foundry-verify
description: Verify a finished interface through real browser journeys, responsive and keyboard checks, and concrete evidence; use before delivery or when a user reports a broken flow.
---

# Foundry / Verify

Turn “looks finished” into an observed result. Verify the user's actual task from
entry to completion, including the state after refresh when persistence matters.
Use [the report template](templates/verification-report.md) for the handoff.

## 1. Define the journey

Read the user request, relevant project instructions, and the implementation.
Write a short acceptance contract before opening the browser:

- Who is the user, where do they enter, and what do they need to accomplish?
- Which visible result proves success? Include saved data or a returned download
  when those are part of the feature.
- Which states are necessary: empty, loading, success, invalid input, permission
  failure, or network failure? Select those the implementation actually supports.
- What is the test origin, account, viewport, and dataset? Label fixtures and mocks.

Inspect the project's existing scripts and run the appropriate build/check once.
Use available browser tooling according to its own instructions. Do not install a
second browser or invent a new control path when the environment forbids it.

## 2. Follow the complete path

Start from a clean entry state in the test environment. Use the interface as a
user would: navigate, enter representative input, submit, and inspect the result.
Follow the primary journey through every step instead of testing only isolated
buttons. Verify back navigation and reload where they are meaningful.

For a full-stack feature, correlate the observed UI with the request and the
resulting test data when the tools permit it. A successful HTTP response alone
does not prove that the user received the right result. A fixture response proves
only the fixture path. Never report an integration as live unless it was exercised.

Use non-sensitive test input. Keep purchases, emails, publishing, account changes,
and destructive actions within existing user authorization; use a sandbox or a
reversible test state when available. Do not execute them merely to collect proof.

## 3. Check interaction quality

At minimum, inspect one wide layout and a narrow viewport around 390 CSS pixels.
Choose another size when an observed breakpoint or a target device needs it.

- Check overflow, reading order, clipped labels, sticky elements, and dialogs.
- Navigate the main path with Tab, Shift+Tab, Enter, Space, and Escape as applicable.
- Confirm visible focus, logical focus order, accessible control names, associated
  form labels, and clear validation feedback. After closing a dialog, focus should
  return to the triggering control where the platform pattern requires it.
- Check zoom/reflow where available, useful contrast, and sufficiently sized touch
  targets. Use an actual measurement tool for numeric contrast claims.
- Respect reduced motion. Confirm content remains understandable when decorative
  animation is removed or paused.
- Exercise a realistic empty result and one recoverable invalid input when relevant.

An automated accessibility scan can supplement these checks. It cannot establish
complete accessibility or replace keyboard and screen-reader work. Name exactly
which assistive technology was used; otherwise record that check as not run.

## 4. Investigate failures, then retest

Inspect console and network errors associated with the journey. Separate failures
caused by application code from missing credentials, test fixtures, and environment
limits. Record a minimal reproduction with route, inputs, viewport, and expected
versus observed result. Remove secrets from logs and screenshots.

Fix failures within the requested scope. Repeat the affected path and nearby
behavior after a change; reuse successful checks when their inputs are unchanged.
Do not broaden a routine UI verification into an unrelated audit.

## 5. Deliver evidence

Create `verification-report.md` only when a written artifact is useful or requested.
Use a concise chat report otherwise. Include the tested commit or source state,
origin, commands and outcomes, journey results, and any relevant screenshots or
trace paths that actually exist. Never fabricate filenames or evidence links.

Use these statuses consistently: **passed** means observed and met the acceptance
contract; **failed** means observed and did not meet it; **blocked** means a named
prerequisite prevented the check; **not run** means it was not attempted. A build
pass, source inspection, screenshot, or static audit is not a browser journey pass.

End with the user-visible outcome and the material verification limits. Avoid
“all tested” when any relevant portion was blocked or not run.
