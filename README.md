# SpaceKeeper for ChromeOS

Name, colour and jump between your ChromeOS desks, from one small window that can stay visible on every desk.

This is the ChromeOS version of [SpaceKeeper for Mac](https://github.com/shuistyle/SpaceKeeper) and [SpaceKeeper for Windows](https://github.com/shuistyle/SpaceKeeper-Windows). It's an installable web app (PWA) with no build step and no server.

> **Needs a managed Chromebook.** ChromeOS only lets apps control desks through Google's Desk API, which a school or organisation administrator has to switch on for SpaceKeeper's web address. See **[ADMIN-SETUP.md](ADMIN-SETUP.md)**. Anywhere else, SpaceKeeper opens in demo mode with pretend desks, so you can still try it.

**Try the demo:** <https://shuistyle.github.io/SpaceKeeper-ChromeOS/?demo>

## What it does

| | |
|---|---|
| **Jump** | Click a desk tile (or press Enter, or 1–9) to go to that desk. |
| **Name** | Double-click, F2 or R. The cursor goes straight into the name box. Your name shows on the tile, with ChromeOS's own name underneath. |
| **Colour** | Right-click (or M, or Shift+F10) › Colour. Ten colour-blind-friendly colours, each with its own symbol, and text with at least 7:1 contrast. |
| **Your order** | Drag tiles, or Alt+Shift+arrow keys. |
| **Add / remove** | **+ Add desk** (Ctrl+Alt+N). Removing a desk moves its windows to the next desk, so nothing is closed. |
| **On every desk** | SpaceKeeper's window can stay on every desk (Settings). |
| **Accessible** | Full keyboard use, screen reader labels and announcements, larger text sizes, light/dark, High contrast mode, reduced motion. |

## How it differs from the Mac version

ChromeOS's Desk API is narrower than what macOS allows, so:

- **SpaceKeeper learns desks as you use them.** ChromeOS doesn't let apps list every desk, so a desk appears once you've been on it while SpaceKeeper was open, or added it with SpaceKeeper. It's remembered after that.
- **Names are SpaceKeeper's own labels.** Apps can't rename ChromeOS desks. To change the name ChromeOS shows in Overview, click the desk's name there.
- **No pinning or fixed order.** ChromeOS doesn't shuffle desks by itself, and apps can't see or change their order, so SpaceKeeper's order is just for its own tiles.
- **No system-wide shortcut.** Web apps can't have one. Keep SpaceKeeper on every desk, or pin it to the shelf.

## Privacy

No accounts, no server, no tracking. Nothing leaves the Chromebook. Names, colours and settings are saved in the browser (local storage) on that Chromebook only. The page loads nothing from anywhere else (enforced by its Content Security Policy).

## Hosting your own copy

Copy these files to any static web host over HTTPS, keeping the folders. Then ask your administrator to allow that address (ADMIN-SETUP.md). Bump `VERSION` in `sw.js` when you update the files, so installed copies refresh.

## Files

```
index.html             The page
styles.css             Look and feel (light/dark, text sizes, High contrast)
js/app.js              Tiles, clicks, keyboard, menu, settings
js/desks.js            Talking to ChromeOS's Desk API (and demo mode)
js/store.js            What's remembered, and checking it on load
js/colors.js           The ten colours and their contrast
js/text.js             Cleaning up names
sw.js                  Opens offline
manifest.webmanifest   Install details and icons
tests/                 npm test  (Node 20+)
ADMIN-SETUP.md         For administrators
publish_to_github.sh   Publishes this folder and its website
```

## Developing

```bash
npm test                        # unit tests
python3 -m http.server 8000     # then open http://localhost:8000/?demo
```

## Licence

MIT. See [LICENSE](LICENSE).
