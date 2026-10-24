---
name: Rerouted
description: Your flight got canceled. Rerouted shops your way home within your card's rules, and you approve with one tap.
colors:
  sign-yellow: "#ffcc00"
  sign-black: "#0b0b0b"
  panel: "#1a1a1a"
  panel-2: "#262626"
  panel-rule: "#3a3a3a"
  white: "#ffffff"
  on-panel-soft: "#b8b8b8"
  on-yellow-soft: "#3d3300"
  alert: "#ff5a4e"
  go: "#3ddc84"
typography:
  display:
    fontFamily: "Source Sans 3, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(2.4rem, 5vw, 4.25rem)"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.03em"
  numeral:
    fontFamily: "Source Sans 3, Segoe UI, system-ui, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 900
    lineHeight: 0.8
    letterSpacing: "-0.04em"
    fontFeature: "\"tnum\""
  headline:
    fontFamily: "Source Sans 3, Segoe UI, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\""
  title:
    fontFamily: "Source Sans 3, Segoe UI, system-ui, sans-serif"
    fontSize: "1.45rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  section:
    fontFamily: "Source Sans 3, Segoe UI, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.4
  body:
    fontFamily: "Source Sans 3, Segoe UI, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "\"tnum\""
  label:
    fontFamily: "Source Sans 3, Segoe UI, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
  board:
    fontFamily: "Source Code Pro, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.06em"
rounded:
  none: "0px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  sign-band:
    backgroundColor: "{colors.sign-yellow}"
    textColor: "{colors.sign-black}"
    typography: "{typography.display}"
    rounded: "{rounded.none}"
    padding: "16px 32px"
  sign-band-canceled:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.alert}"
    typography: "{typography.display}"
    rounded: "{rounded.none}"
  option-panel:
    backgroundColor: "{colors.sign-yellow}"
    textColor: "{colors.sign-black}"
    rounded: "{rounded.none}"
    padding: "16px"
  button-approve:
    backgroundColor: "{colors.sign-black}"
    textColor: "{colors.white}"
    rounded: "{rounded.none}"
    padding: "12px 16px 12px 12px"
  button-approve-hover:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.white}"
  board-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.white}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  stamp-refused:
    backgroundColor: "{colors.sign-black}"
    textColor: "{colors.alert}"
    rounded: "{rounded.none}"
    padding: "12px"
  receipt-slip:
    backgroundColor: "{colors.white}"
    textColor: "{colors.sign-black}"
    rounded: "{rounded.none}"
    padding: "16px"
  pictogram:
    backgroundColor: "{colors.sign-black}"
    textColor: "{colors.white}"
    rounded: "{rounded.none}"
    size: "36px to 88px square, glyph at 62%"
  demo-key:
    backgroundColor: "{colors.sign-yellow}"
    textColor: "{colors.sign-black}"
    typography: "{typography.board}"
    rounded: "{rounded.none}"
    size: "24px"
---

# Design System: Rerouted

## Overview

**Creative North Star: "The Terminal Sign"**

Rerouted is an airport wayfinding system rebuilt for the way home after a cancellation. The page reads like overhead signage: one yellow band says the single thing to know at monumental scale, yellow panels are the routes you can take and act on, and black panels carry everything that is information rather than a route (the live board, the corridor, refusals, routes set aside). Nothing is ornamental. Every surface is a sign, a board, or a printed slip.

Density is high but legible at a distance: heavy humanist sans at sign scale, tabular figures everywhere, hairline rules between board rows, and square corners throughout. Depth comes from the one three.js scene, the deadline corridor, which stays on a black ground and uses the same yellow, white and red as the flat page. State changes behave like a departures board: a message flaps in, a row wipes in, a refusal is stamped, and closed options shrink to a board row instead of disappearing.

The world refuses the dashboard shell (sidebar, stat cards, chart, table), the chat transcript, gradients, glow and glass.

**Key Characteristics:**
- Yellow is the path home and nothing else; black carries information.
- Source Sans 3 at weights 800 and 900 for anything that must be read at a glance; Source Code Pro only for board cells, card digits, times on the receipt and hashes.
- Filled white pictograms in black inset squares, drawn for this system.
- Square corners, flat surfaces, borders of 2px or 4px sign black where a panel needs an edge.
- Motion is mechanical and short (320 to 420ms, expo-out), and all of it stops under reduced motion.

## Colors

A two-voice signage palette: yellow panels and sign black, with white and one alert red that live only on black.

### Primary
- **Terminal Yellow** (sign-yellow): the path. The sign band, the ranked option panels, the empty choices panel, the deadline frame and booked route in the corridor, the flying plane, the spend meter fill, focus rings on black, text selection, demo key caps, and the 2px frame around the demo controls.

### Neutral
- **Sign Black** (sign-black): page ground, all text on yellow, pictogram squares, the approve button, stamps and the booked confirmation strip inside a yellow panel, the 4px band underline.
- **Board Panel** (panel): every information panel (corridor section, live board, set aside list, card rules) and the corridor's WebGL clear colour.
- **Board Panel Raised** (panel-2): hover fill for buttons on black and the empty track of the spend meter.
- **Board Rule** (panel-rule): hairline dividers between board rows and above the footer, the scrollbar thumb, corridor hour ticks.
- **Sign White** (white): text and pictograms on black, the receipt slip ground, the 4px outline that marks the booked option.
- **Board Soft** (on-panel-soft): secondary text on black (timestamps, captions, closed option rows), about 9:1 on panel.
- **Yellow Soft** (on-yellow-soft): secondary text on yellow (band detail line, rule reasons, struck old prices), about 9:1 on yellow.

### Tertiary
- **Board Alert** (alert): CANCELED, refused and error board rows, refusal stamps, the alert-filled pictogram square, the set aside top rule and strike line, the canceled flight's arc and the refused-route flash in the corridor.
- **Board Go** (go): one use, the receipt chain verified line on its black strip.

### Named Rules
**The Path Rule.** Yellow marks a route you can follow or act on. Information, warnings and state never sit on a yellow ground of their own; inside a yellow panel they go on a black strip.

**The Red On Black Rule.** Alert red and go green appear only on sign black or the board panel. Never set red text on yellow or white.

**The Soft Pairing Rule.** Secondary text uses the soft tone of its ground: board soft on black, yellow soft on yellow, sign black at 70% on the white receipt. Never use one grey across grounds.

## Typography

**Display Font:** Source Sans 3 (with Segoe UI, system-ui)
**Label/Mono Font:** Source Code Pro (with ui-monospace), weights 500 and 600

**Character:** A Frutiger-lineage humanist sans pushed to black weight and tight tracking, so lines read like overhead signs; a quiet mono for the cells that are real data.

### Hierarchy
- **Display** (900, 2.4rem phone to 4.25rem desktop, 0.95, -0.03em): the sign band's one message. Balanced wrap.
- **Numeral** (900, 4.5rem, 0.8, -0.04em): option rank numerals, standing where a gate number would.
- **Headline** (900, 2rem, 1, -0.02em): prices on option panels, spend against cap. The band's elapsed clock uses the same weight at 1.875rem to 3rem.
- **Title** (800, 1.45rem, 1.25, -0.01em): option titles.
- **Section** (800, 1.25rem): every panel heading, and the wordmark at 1.25rem to 1.5rem.
- **Body** (400, 17px, 1.45): explanations, capped near 44 to 48ch. Emphasis lines run at 1.125rem weight 700.
- **Label** (600 to 700, 0.875rem): captions, tier words, meter labels.
- **Board** (Source Code Pro 600, 0.875rem, 0.06em, uppercase words): board timestamps and step kinds (INFO, SEARCH, DECIDED, REFUSED, ERROR), card digits, receipt times and hashes (hashes break anywhere).

### Named Rules
**The Tabular Rule.** The body sets tabular figures globally. Every time, price and count lines up; never turn it off.

**The Mono Is Data Rule.** Source Code Pro appears only where the text is a machine value or a board cell. Headings, buttons and prose are always the sans.

## Layout

One page. A sticky sign band spans the top on desktop (it scrolls away on phones). Below it a centred container caps at 1600px with 16px side padding on phones and 32px from 768px.

From 1024px the main area is a two-column grid, roughly 59 to 41 (1.45fr and a 380px-minimum 1fr) with 24px gaps: the corridor panel then the live board on the left, the stack of option panels, receipt, set aside list and card rules on the right. Below 1024px it collapses to one column in decision order: choices first, corridor second, board third. The corridor stage is 220px tall on phones, 360px from 640px and 440px from 1024px.

Rhythm is 4px based and tight: 12px between option panels, 16px between right-column blocks and inside panels, 24px on desktop panel padding. The footer states what is real and simulated in three columns from 768px; the demo controls sit last in a yellow-framed strip.

## Elevation & Depth

The page is flat. There are no shadows, gradients, blurs or translucent surfaces. Separation comes from ground colour (yellow panel, black board, white slip on sign black), from 2px and 4px sign black or white edges, and from hairline rules.

The only depth is the deadline corridor, a three.js scene on a board-panel ground with a perspective camera (30 degree field of view, high three-quarter view). It uses unlit materials only, so it shares the page's flat colour: a near-black floor (#141414), board-rule hour ticks with grey labels (#9a9a9a) on a New York time axis from 8 PM to 5 PM, and a yellow post-and-beam frame at 9:00 AM with a faint yellow veil (3.5% opacity) and a yellow sign reading "Arrive JFK by 9:00 AM". Each option is a tube arc from departure to arrival, white for flights, light grey (#c8c8c8) for the hotel, soft grey (#8a8a8a) for set aside routes. Labels are canvas sprites in the page fonts.

### Named Rules
**The Flat Page Rule.** Nothing on the page casts a shadow. If a panel needs to stand out, change its ground or give it an edge.

**The One Stage Rule.** Three-dimensional depth lives only in the corridor, and the corridor uses only the page's palette.

## Shapes

Square sign corners everywhere: panels, buttons, pictogram squares, key caps, chips, the meter and the receipt (0px). Edges are flat colour: a 4px sign black underline on the band, a 4px white outline around the booked option, a 4px alert rule over the set aside list, 2px sign black above tier rules, a 2px yellow frame around the demo controls, a dashed 1px rule between receipt entries. Deadline chips are either filled sign black with yellow text (makes it) or a 2px inset sign black ring (late).

Pictograms are filled, single-weight 24-unit SVG glyphs (depart, arrive, bed, card, closed, clock, refund, reroute, agent) drawn at 62% of a black square. The square turns yellow with a black glyph on black panels where it marks the path or the card, and alert red with a black glyph where it marks a refusal or closure. The corridor's flying plane is the same silhouette as the depart and arrive glyphs.

## Components

### Sign Band
The one thing to know. Wordmark with the reroute pictogram at 40px, the message pictogram at 88px (desktop only), the display line with a detail line beneath, and the elapsed clock at the right once the flight is canceled. Yellow in every state except canceled, when it turns to the board panel with the message in alert red and an alert pictogram square. Each new message flaps in.

### Option Panel
- **Corner Style:** square (0px).
- **Background:** terminal yellow; the booked option adds a 4px white outline.
- **Structure:** fixed furniture per option: rank numeral and pictogram in a left column, then title and price, departure and landing line, the deadline chip, Claude's one-sentence reason, then a 2px black rule over the tier words and rule reasons.
- **Internal Padding:** 16px.
- **Entry:** wipes in left to right, staggered 90ms per rank.
- **Closed:** once a flight is booked, every other option shrinks to one board row (rank, title, "Not needed now") in soft text. Nothing is removed.
- **Voided price:** the old price stays under the new one in yellow soft, struck through at 2px.

### Approve Button
- **Shape:** square, full panel width, sign black.
- **Content:** a card pictogram in a yellow square, "Approve" plus the exact price (1.25rem, 800), and "one tap" in board soft at the right.
- **Hover / Active:** fill moves to board panel raised; presses to 98.5% scale over 150ms. Disabled shows a wait cursor at 60% opacity with the busy line "Checking your card's rules".
- **Focus:** the global 3px yellow outline at 3px offset; inside yellow regions the outline turns sign black.

### Stamps
Refusals and voids are stamped, not toasted: a sign black strip inside the option panel with an alert pictogram, a soft caption naming who tried, and the reason in bold alert red. It stamps in (scale 1.25 to 1 over 320ms). The booked confirmation uses the same strip with yellow text and a yellow arrive pictogram.

### Board
Departures-board rows on the board panel: mono timestamp, mono uppercase step kind coloured by kind (soft, white, yellow for decided, alert for refused and error), then the step text. Rows are divided by board-rule hairlines at 60% and wipe in as they arrive. The header carries the panel title and whether the data is live or mock.

### Card Rules Sign
Board panel with a yellow card pictogram, spend against cap at headline size, and a 16px meter: board-panel-raised track, yellow fill that eases over 700ms, a white 2px tick at the ask-first threshold, labels beneath.

### Set Aside List
Board panel under a 4px alert rule, headed by an alert pictogram. Each blocked route is a row with its price struck in alert and its reason in alert text; Claude's flags add a soft line saying a flag can only raise the tier.

### Receipt Slip
A white slip on sign black, headed under a 4px black rule. A two-column definition list (8.5rem labels in sign black at 70%), the amount at 1.5rem 900, card digits, times, quote and hashes in mono with hashes printed in full. Entries are separated by dashed rules. A black strip states whether the chain verified in the browser (go green) or broke (alert). The refund owed closes the slip beside a refund pictogram.

### Demo Controls
A strip framed by a 2px yellow border. Each control is a white bold label with a 24px yellow key cap in mono; hover fills with board panel raised; disabled drops to white at 35%.

### Deadline Corridor (signature)
Renders only while something moves. Routes draw in along their length over 900ms, staggered 160ms per rank, with an end cap that pops at landing and a label that fades in. The canceled flight turns alert red, snaps at its middle and falls away. Set aside routes are drawn, held for a beat, then drop through the floor. A refused purchase flashes the route alert red for 900ms. On booking, other flights fade to 30%, the booked route's cap and label turn yellow, and a yellow plane flies the arc once over 2.6s. Under reduced motion every tween jumps to its end state.

## Do's and Don'ts

### Do:
- **Do** reserve terminal yellow for routes and actions: the band, option panels, the deadline frame, the booked route.
- **Do** put alert red and go green only on sign black or the board panel.
- **Do** set anything read at a glance in Source Sans 3 at 800 or 900 with negative tracking, and keep tabular figures on.
- **Do** mark every icon as a filled white pictogram in a black inset square, switching the square to yellow (path, card) or alert (refusal) on black panels.
- **Do** keep closed or voided things visible: shrink to a board row, strike through, or stamp.
- **Do** keep corners square and surfaces flat; use 2px or 4px colour edges and hairline rules for separation.
- **Do** keep motion between 150ms and 420ms on the page with the expo-out curve, and stop it under reduced motion.

### Don't:
- **Don't** use gradients, glow, glass, blur or drop shadows anywhere on the page.
- **Don't** round corners.
- **Don't** set red text on yellow or white grounds.
- **Don't** use Source Code Pro for headings, buttons or prose.
- **Don't** add icon-library icons or text glyphs as icons; draw a pictogram in the system's weight.
- **Don't** introduce a sidebar, stat cards, a chat transcript, or small uppercase labels above headings.
