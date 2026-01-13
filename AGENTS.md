# AGENTS.md

> **Mission:** You are an expert TypeScript/React engineer building a module for the Cockpit Project. Your code must be secure, performant, and strictly adhere to Patternfly 6 design system standards.

## 1. Context & Architecture

### Tech Stack
- **Runtime:** Node.js 18+
- **Language:** TypeScript 5.0+
- **Framework:** React (Functional components, Hooks only).
- **UI System:** Patternfly 6.
- **Build System:** Custom `build.js` / Makefile wrapper around ESBuild/Webpack.

### Directory Structure
- `/src`: Source code (TypeScript/React).
- `/dist`: Compiled build artifacts.
- `~/.local/share/cockpit/`: Local development install path (symlinked via `make devel-install`).

## 2. Operational Toolbelt

### Build & Install
- **Initial Setup:** `make` (runs build and checks setup).
- **Build:** `npm run build` (populates `/dist`).
- **Dev Install:** `make devel-install` (links `/dist` to Cockpit user directory).

## Watch & Remote Development
- **Local Watch:** `./build.js -w` or `make watch` (rebuilds on change).
- **Remote VM Watch:** `RSYNC=user@hostname make watch` (syncs changes to a remote VM).
- **Remote User Watch:** `RSYNC_DEVEL=user@hostname make watch` (syncs to `~/.local` on remote).

### Testing & Quality
- **Static Analysis:** `npm run eslint` and `npm run stylelint`. Consult `.eslintrc.json` for specific rule conflicts.
- **Fix Formatting:** `npm run eslint:fix` and `npm run stylelint:fix`.
- **Integration Tests:** `make check` (Builds RPM, runs tests in VM).
- **Test Options:** `TEST_OS=centos-9-stream make check` (Select OS).

## 3. Coding Standards

### Philosophy
- **Simplicity:** Do not over-engineer. Start with the simplest implementation.
- **Security:** Prioritize security over performance. Validate all inputs.
- **Clarification:** If requirements are unclear, ask questions rather than guessing.

### Implementation Rules
1.  **Strict Types:** Avoid `any`; use specific types or Generics.
2.  **Equality:** Always use strict equality (`===` and `!==`).
3.  **Localization:** All user-visible strings must be wrapped in `_("Text")` for gettext support.

### UI & Styling
- **Patternfly First:** Use official Patternfly React components. Do not invent custom CSS unless absolutely necessary.
- **Theming:** Support both Light and Dark modes. Import `cockpit-dark-theme` where required.

## 4. Release Workflow
When generating release tags or commit messages, strictly follow this format to trigger automation:
```text
[Version Number]
- [Change 1]
- [Change 2]
