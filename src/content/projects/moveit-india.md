---
title: A logistics platform of 20+ microservices
client: MoveIt
kind: fullstack
category: Logistics app
year: 2025
summary: Customer and driver apps on a backend of 20+ low-latency microservices, from onboarding to payments. Launching soon in Chennai.
services: [Go, NestJS, Kafka, PostgreSQL, Redis, Kubernetes, AWS]
duration: Ongoing
color: "#e0814f"
role: Sole backend engineer
note: Built at TIC Global Services
url: https://play.google.com/store/apps/details?id=com.moveeit.customer&hl=en_IN
links:
  - { label: "Google Play", href: "https://play.google.com/store/apps/details?id=com.moveeit.customer&hl=en_IN" }
media: { type: logo, src: /media/works/moveit-logo.png, bg: "#14110f", caption: "Launching soon in Chennai · Google Play" }
metrics:
  - { value: "20+", label: "microservices in production" }
  - { value: "<200 ms", label: "service response times" }
  - { value: "35%+", label: "monthly AWS cost cut" }
order: 1
---

## The problem

A logistics business needed one platform for customers, drivers and dispatch: onboarding, KYC, live tracking, notifications and payments, fast enough for real-time use. The customer app is about to launch in Chennai.

## What I built

As the sole backend engineer, I built driver onboarding, dispatch, tracking, notifications, payments and KYC across 20+ microservices (Go, NestJS) with caching and event-driven processing on Kafka, running on AWS EKS.

Real-time driver discovery and dispatch use Redis geospatial indexing, WebSockets and asynchronous events.

## Outcome

- Service response times held below **200 ms** across 20+ microservices.
- Monthly AWS cost cut by more than **35%**, with production reliability preserved.
