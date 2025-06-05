# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) for the Angular Telemetry package.

## What is an ADR?

An Architecture Decision Record (ADR) is a document that captures an important architectural decision made along with its context and consequences. ADRs are immutable documents that serve as a historical record of the evolution of the architecture.

## ADR Index

| ID | Status | Title | Date |
|----|--------|-------|------|
| [ADR-001](001-decorator-based-instrumentation.md) | Accepted | Decorator-Based Instrumentation | 2025-06-05 |
| [ADR-002](002-unified-telemetry-decorator.md) | Accepted | Unified @Telemetry Class Decorator | 2025-06-05 |
| [ADR-003](003-type-safe-callbacks.md) | Accepted | Type-Safe Telemetry Callbacks | 2025-06-05 |
| [ADR-004](004-universal-traced-decorator.md) | Accepted | Universal @Traced Decorator | 2025-06-05 |
| [ADR-005](005-imperative-declarative-coexistence.md) | Accepted | Coexistence of Imperative and Declarative APIs | 2025-06-05 |

## Creating a New ADR

To create a new ADR:

1. Copy the template from [template.md](template.md)
2. Create a new file with the format `NNNN-title-with-hyphens.md` where `NNNN` is the next available number
3. Fill in the template with your decision
4. Add an entry to this index file
5. Submit for review

## ADR Statuses

- **Proposed**: A decision has been proposed but not yet reviewed
- **Accepted**: A decision has been accepted and is being implemented
- **Deprecated**: A decision has been superseded by a newer decision
- **Superseded**: A decision has been replaced by a newer decision (reference the newer decision)
- **Rejected**: A decision has been considered and rejected
