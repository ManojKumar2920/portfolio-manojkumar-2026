---
title: The AI-powered business operating system
client: Crux
kind: fullstack
category: SaaS · AI
year: 2026
summary: One system of record for people, payroll, projects, sales, stock and money, with Mei, an AI assistant that answers from the company's own data.
services: [Go, Gin, GORM, PostgreSQL, Redis, Next.js, OpenAI API]
duration: Ongoing
color: "#2f6bff"
role: Architect
url: https://trycrux.in
links:
  - { label: "trycrux.in", href: "https://trycrux.in" }
media: { type: video, src: /media/works/crux.mp4, poster: /media/works/crux.jpg }
wallMedia: { type: logo, src: /media/works/crux-logo.png, bg: "#105cf2", caption: "trycrux.in" }
metrics:
  - { value: "10+", label: "tools replaced by one" }
  - { value: "24 h", label: "from sign-up to running" }
  - { value: "<500 ms", label: "across millions of records" }
order: 2
---

## The problem

Growing businesses run CRM, accounting, projects, HR, payroll and inventory in ten separate tools, with ten logins and per-user fees, and still can't ask a simple question across all of it.

## What I built

Crux: one system of record for a company's people, payroll, projects, sales, stock and money, in two editions: **Services** for firms that sell their time (clients, projects, timesheets) and **Goods** for businesses that sell products (orders, stock, purchasing).

- **Modules:** CRM, accounting (estimates, invoices, credit notes, receipts), projects and tasks, inventory and orders, people and HR (attendance, shifts, leave) and payroll (salary structures, approvals, payslips).
- **Mei**, the AI assistant, answers questions from the company's own data (attendance, overdue invoices, project status), generates reports as CSV or PDF, and can draft a client or an invoice, which stays a draft until a person confirms it. Access can be limited to people, teams or departments, and usage is shown per person, model and token so AI costs stay visible.
- Sold as a one-time licence that runs on the customer's own server: unlimited users, no per-user fees.

## Outcome

- Replaces **10+** separate tools with **one** login for the whole team.
- Set up within **24 hours**.
- Retrieves millions of records in under **500 ms**, even on modest servers.
