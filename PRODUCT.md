# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Si-Ware employees use the intranet to find company updates, workplace resources, people information, knowledge sessions, policies, and links to everyday tools.

## Product Purpose

The Si-Ware Global Intranet is a local, role-aware employee portal that brings company information, learning, operational resources, and employee news into one place.

## Positioning

Unlike the public Si-Ware website, this intranet combines external company news with employee-facing resources and an admin-managed dashboard.

## Operating Context

Employees access the portal through a browser. Administrators can manage dashboard content using the built-in CMS; local Docker storage preserves administrative changes.

## Capabilities and Constraints

- The project is a zero-dependency Node.js web application run locally with Docker.
- Dashboard content is seeded from `data/seed.json` and persisted to `data/intranet.json`.
- The company-news carousel and News page fetch the latest public Si-Ware news server-side from `https://www.si-ware.com/company/news`, include its published artwork, and retain a short-lived local cache for source outages.
- The existing New Si-Warians page remains available at `/new-hires.html`; it is no longer the primary dashboard feature or top-bar destination.

## Brand Commitments

- Preserve the Si-Ware Systems name, logo, and blue/cyan brand character.
- The company-news experience should take structural inspiration from `https://www.si-ware.com/company/news` while remaining an intranet feature.

## Evidence on Hand

- Current intranet implementation in `public/`.
- Official company news at `https://www.si-ware.com/company/news`.
- Current employee content in `data/seed.json`.

## Product Principles

- Make the next relevant company update easy to notice and open.
- Keep employee operations and public company storytelling clearly distinct.
- Preserve direct, accessible navigation to important destinations.
- Use verified company information rather than fabricated announcements.
