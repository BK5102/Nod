# Dashboard screens

`before-*` was captured before the one-screen redesign, `after-*` after it. Mock data (`?mock=1`), so every run is identical. Five states, at 1440x900 and 1920x1080.

## Step 0 audit (judge's eye, 1440x900 and 1920x1080)

Confirmed from the brief:
- The first frame is all zeros (ways home 0, land by 9:00 AM 0, spent $0, refund $0) plus an empty-state card. It says nothing.
- Two large yellow blocks (the sign band and the option panels) compete with each other and with small yellow chips. Nothing is the focal point.
- A blank dark strip shows under the hero before the trip loads.
- The step tracker uses the same minus icon for "Canceled" and "Agent blocked", and jargon labels ("Searched", "Listings").
- "Latest" says "Waiting for a cancellation" next to a "Live" tag that means nothing to a judge.
- Section tabs (Trip, Options, Card) and an admin email with Sign out read as a generic admin app.
- The demo controls look like a debug panel.
- The page scrolls at 1440x900: card rules, the set-aside shelf and the receipt are below the fold.

Also found:
- Set-aside routes leave their labels stacked on top of each other in the 3D scene.
- At 1920 the content floats in a centered column with empty gutters.
- Three different Approve button styles (black, yellow on black, yellow on yellow).
- The price-hold countdown and rule chips are about 12px: unreadable from 3 feet.
- The free-rebooking panel inverts the colour scheme, adding a third focal point.

## Round 3 audit (light dashboard, `v3before-*` / `v3after-*`)

Walked reset, cancel, agent tries to buy, price moves, approve at 1440x900 and 1920x1080 (mock data).

Fixed in this round:
- Three yellows compete: the active menu item, the presenter's next key and the Approve button. Yellow should be the next action only.
- The flagged Skyport listing and the agent refusal use the same lock marker in the steps.
- The refusal step is cut off mid-sentence ("Refused: t..."), and so is "Why #1".
- Red step markers put near-black glyphs on red (low contrast).
- The card meter opens on "$0 / $600": zeros are the first number a judge reads.
- The calm trip card has a gray square between SFO and JFK that reads as a missing image.
- Keyboard focus is a yellow ring on white (1.6:1), effectively invisible.
- The type is a default-looking humanist sans with no big moment; prices and the headline share one face.
- The price-change box reads as a paragraph, not an event.
- The demo controls are titled "Presenter" with no sign they trigger simulated events.

Already fine: no empty dark strip, no admin email (only a small Sign out at the bottom of the menu), everything for the demo fits at 1440x900 without scrolling.

Left alone: labels of the set-aside routes can overlap inside the 3D scene at 1920 (camera framing; risky to retune before judging).

## Round 4: live flights and travelers only (`v4-*`)

- `v4-live-options-1440`: real flights from Google Flights via SerpApi, on the time axis that starts at the current hour.
- `v4-live-price-1440`: the agent refused, then the top fare up $23 ($382 to $405); the old approval void, the flight reranked.
- `v4-live-booked-1440`: booked at $405, receipt, $318 refund owed.
- `v4-corridor-dragged-1440`, `v4-corridor-expanded-1440`: the 3D panel turned and zoomed by hand, and expanded.
- `v4-landing-1440`: the landing page with the traveler-only section ("alone at the gate" vs "with Rerouted") and the route ahead.

Checked: `pnpm typecheck`, and `pnpm demo:check` twice on live flights with `pnpm demo:reset` between runs.
