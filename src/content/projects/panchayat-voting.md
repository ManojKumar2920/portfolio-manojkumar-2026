---
title: A voting platform for 47M+ requests
client: Amazon Prime Video · Panchayat S4
kind: fullstack
category: Campaign platform
year: 2025
summary: panchayatvoting.com, the election in Phulera that let fans vote to bring Panchayat Season 4 forward, built for 200K+ concurrent voters at 99.99% uptime.
services: [Next.js, Redis, Cloudflare Workers, AWS]
duration: 4-day campaign
color: "#d8a32a"
role: Architect
links:
  - { label: "Amazon's announcement", href: "https://www.aboutamazon.in/news/entertainment/prime-video-panchayat-season-4-arriving-July-2" }
media: { type: image, src: /media/works/panchayat.jpg }
metrics:
  - { value: "47M+", label: "requests in four days" }
  - { value: "6M+", label: "votes counted" }
  - { value: "99.99%", label: "uptime at 200K+ concurrent" }
order: 5
---

## The campaign

Before Panchayat Season 4, Prime Video staged an election in Phulera: **Team Manju Devi** against **Team Kranti Devi**, each promising to bring the season out earlier than its 2 July launch if they won. Sachiv ji asked fans to cast their vote on **panchayatvoting.com**.

## What I built

I architected and deployed the voting platform: distributed caching, rate limiting, edge computing on Cloudflare Workers and traffic management, with abuse prevention through device fingerprinting, request validation and throttling.

## Outcome

- **47M+** requests and **6M+** votes from **200K+** concurrent users over four days.
- **99.99%** uptime.
- Helped the campaign bring the release forward a week.
