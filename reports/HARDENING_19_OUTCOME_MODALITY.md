# Hardened 19 — Outcome Modality + Capability Closure

This build fixes a live semantic failure where Company Zero could turn a requested world change into documentation about that change and then present an ungrounded metric card as though a result had been measured.

## New runtime laws

1. Requested-world-outcome completion and deliverable completion are separate facts.
2. Documentation, advice, plans, and generated files must never silently substitute for causing a requested physical, transactional, communication, or external-system state.
3. The goal compiler explicitly proposes the requested outcome modality and world change.
4. Capability sufficiency now checks effect modality in addition to semantic observe/act/verify coverage.
5. When direct outcome closure is impossible, Company Zero may continue producing the strongest truthful reversible progress, but the requested outcome remains unverified.
6. Outcome UI labels insufficient evidence as `Not verified yet`; it no longer describes absent before/after evidence as a measured change.

## Modality classes

`informational | digital | physical | transactional | communication | external_system | mixed | unknown`

These are universal effect classes, not industry or prompt templates.

## Current Studio authority

Company Zero Studio declares only `informational` and `digital` effects. It cannot satisfy a requested physical-world actuator requirement merely because it can create an artifact.

## Verification

`tests/outcome-modality-closure.test.mjs` verifies modality mismatch, best-achievable progress, missing-actuator reporting, external-evidence truthfulness, and scans production code to ensure the behavioral example prompts were not hard-coded.
