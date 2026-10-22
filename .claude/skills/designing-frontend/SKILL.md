---
name: designing-frontend
description: Creates distinctive, production-grade frontend interfaces using TanStack Start and shadcn/ui. Use this skill when the user asks to build web components, pages, dashboards, or when styling/beautifying the Document Management System (DMS) UI.
---

# Designing Frontend for DMS

This skill guides the creation of distinctive, production-grade frontend interfaces that align with the Dynamic Document Workflow Management System (DMS) architecture. Implement real, working code with exceptional attention to aesthetic details, usability, and the specific Tech Stack (TanStack Start, TypeScript, shadcn/ui).

## When to use this skill
- Building new UI components or pages for the DMS.
- Styling or beautifying existing interfaces (e.g., the Inbox, Workflow Builder).
- Translating PRD requirements into functional React components.
- Setting up or composing `shadcn/ui` components with Tailwind CSS.
- Implementing frontend interaction and validation using Zod.

## Workflow

- [ ] **Contextualize**: Understand the purpose of the interface (e.g., Inbox, Approval Form) within the DMS North Star (removing confusion, tracking status).
- [ ] **Determine Constraints**: Ensure compatibility with TanStack Start (SSR), Server Functions, and TypeScript.
- [ ] **Select Components**: Identify the necessary `shadcn/ui` components for the task. Keep it headless and copy-paste friendly.
- [ ] **Draft the Interface**: Create the UI focusing on typography, spacing, and clear visual hierarchy using Tailwind CSS.
- [ ] **Refine & Polish**: Add necessary micro-interactions (e.g., hover states, focus rings, loading skeletons) without overwhelming the utilitarian purpose.

## Instructions

### 1. Design Thinking & Aesthetic Direction
Before coding, commit to a design direction that serves the DMS:
- **Purpose**: The UI is for an organization's workflow. The primary goal is **clarity** and **autonomy**.
- **Tone**: Professional, Utilitarian, Modern, and Accessible. The design should facilitate fast decision-making (e.g., Approving documents, reading statuses).
- **Constraints**: 
  - Must use **TanStack Start** (file-based routing, server functions).
  - Must use **shadcn/ui** for UI primitives.
  - Must use **Tailwind CSS** for styling (as dictated by shadcn).
  - Strongly type everything with **TypeScript** and **Zod**.
- **Differentiation**: What makes this interface exceptionally clear? Focus on status indicators (Draft, In Review, Need Revision, Completed) and unambiguous Call-to-Actions (Approve, Reject, Upload).

### 2. Frontend Aesthetics Guidelines
Focus on these elements within the enterprise context:
- **Typography**: Choose clean, highly legible fonts suitable for reading documents and data tables (e.g., Inter, Roboto, or Geist). Establish a strict typographic hierarchy to separate metadata (like dates and roles) from primary content.
- **Color & Theme**: Commit to a cohesive professional palette. Use CSS variables (via shadcn/ui themes). Rely on semantic colors for status (e.g., Amber for Need Revision, Green for Completed, Blue for In Review). Do not use chaotic or clashing colors.
- **Motion**: Use subtle, purposeful animations. A smooth slide-in for alerts, accordion expansions, or a gentle state transition for buttons. Avoid disruptive or purely decorative animations. Prioritize CSS/Tailwind transitions.
- **Spatial Composition**: Prioritize data density where needed (e.g., Inbox data tables) but use generous padding around independent interactive elements. Ensure clear separation between the document viewer and the action panel.
- **Backgrounds & Visual Details**: Stick to clean backgrounds (light or dark mode). Use delicate borders and soft shadows to delineate cards and modular sections. 

### 3. Implementation Rules (DMS HUKUM)
- **No Magic Strings**: Use typed constants for statuses, roles, routes, and keys.
- **Layer Separation**: Separate presentational logic (`src/components/ui/` - shadcn/ui gaya `base-nova` di atas Base UI) from business logic (`src/components/` - smart components). Data fetching belongs in `src/routes/` or `src/lib/`.
- **State & Routing**: Embrace TanStack Start's file-based routing and server functions over heavy client-side state. Let the server dictate the shape of the data.
- **Zod Boundaries**: Always implement Zod schemas for form submissions and server action inputs.

Remember: A great DMS UI is one where users never have to guess what their next action is. Elegance comes from extreme clarity, robust functionality, and frictionless user flows.
