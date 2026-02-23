---
name: camofox
description: Anti-detection browser for sites that block regular browsers. Uses Camoufox (Firefox fork) with fingerprint resistance. Use when agent-browser gets blocked or detected by anti-bot services.
allowed-tools: Bash(camofox:*)
---

# Anti-Detection Browser with Camofox

## When to use

Use `camofox` instead of `agent-browser` when:
- A site blocks or detects the regular Chrome browser
- You encounter CAPTCHAs, "bot detected" pages, or Cloudflare challenges
- The site requires fingerprint-resistant browsing

Camofox wraps Camoufox, an anti-detection Firefox fork, via a REST API on the host.

## Quick start

```bash
camofox open <url>          # Navigate to page, get snapshot
camofox snapshot -i         # Get interactive elements with refs
camofox click @e1           # Click element by ref
camofox type @e2 "text"     # Type into element by ref
camofox close               # Close tab
```

## Core workflow

1. Navigate: `camofox open <url>`
2. Snapshot: `camofox snapshot -i` (returns elements with refs like `@e1`, `@e2`)
3. Interact using refs from the snapshot
4. Re-snapshot after navigation or significant DOM changes

## Commands

### Navigation

```bash
camofox open <url>          # Open URL in new tab, returns snapshot
camofox back                # Go back
camofox forward             # Go forward
camofox close               # Close current tab
```

### Snapshot (page analysis)

```bash
camofox snapshot            # Full page snapshot
camofox snapshot -i         # Interactive elements only (recommended)
```

### Interactions (use @refs from snapshot)

```bash
camofox click @e1           # Click element
camofox type @e2 "text"     # Type text into element
camofox scroll down         # Scroll down
camofox scroll up           # Scroll up
```

### Screenshots

```bash
camofox screenshot          # Save to /tmp/camofox-screenshot.png
camofox screenshot path.png # Save to specific path
```

### Cookies

```bash
camofox cookies auth.json   # Export cookies to file (or import if file exists)
```

## Example: Navigate a protected site

```bash
camofox open https://protected-site.com
camofox snapshot -i
# Output shows: textbox "Email" [ref=e1], textbox "Password" [ref=e2], button "Login" [ref=e3]

camofox type @e1 "user@example.com"
camofox type @e2 "password123"
camofox click @e3
camofox snapshot -i  # Check result
```
