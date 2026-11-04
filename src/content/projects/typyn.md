---
title: A runtime validation library, 5–100× faster than Zod
client: Typyn
kind: fullstack
category: Open source
year: 2025
summary: Zero-dependency TypeScript validation with full type inference in about 5 KB gzipped.
services: [TypeScript, npm, GitHub Actions]
duration: Open source
color: "#b08a45"
role: Author & maintainer
metrics:
  - { value: "5–100×", label: "faster than Zod in tests" }
  - { value: "10M+", label: "primitive checks per second" }
  - { value: "~5 KB", label: "gzipped, zero deps" }
wall: false
order: 9
---

## The problem

Runtime validation libraries are often heavy and slow on hot paths, while still needing full TypeScript inference.

## What I built

Typyn: a zero-dependency runtime validation library with full TypeScript inference and an approximately **5 KB** gzipped bundle, published on npm with CI on GitHub Actions.

## Outcome

- **7M–10M+** operations per second on primitive validators, **4M+** on objects.
- Reported **5–100× faster than Zod** in tested scenarios.
- Adopted by **100+** live projects.
