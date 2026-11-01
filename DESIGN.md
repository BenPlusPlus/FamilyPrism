---
name: FamilyPrism
description: Self-hosted family PC console in the Key Rack world. Each PC is a coloured key tag on a hall hook bar.
colors:
  rail: "#1e2b2f"
  rail-raised: "#2a3a3f"
  rail-line: "#34474c"
  rail-ink: "#e3e9e6"
  rail-muted: "#a3b2af"
  brass: "#f2b705"
  ground: "#eef0ec"
  paper: "#ffffff"
  ink: "#15191a"
  ink-2: "#4b5654"
  ink-3: "#66716f"
  line: "#c9cec9"
  line-soft: "#e1e4e0"
  steel: "#9aa3a6"
  steel-dark: "#6f797c"
  tape: "#121415"
  tag-red: "#d7263d"
  tag-yellow: "#f2b705"
  tag-blue: "#1f6fd1"
  tag-green: "#2e9f5b"
  tag-orange: "#ee6c2b"
  tag-violet: "#7a4fd1"
  home: "#1e7a46"
  away: "#66716f"
  warn: "#f2b705"
  warn-ink: "#5c4500"
  danger: "#b3261e"
  danger-soft: "#fbeae8"
  ok-soft: "#e6f3eb"
  focus: "#1f6fd1"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(2rem, 3.4vw, 3rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  body-small:
    fontFamily: "Archivo, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
  hint:
    fontFamily: "Archivo, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
  tape:
    fontFamily: "Archivo Narrow, Archivo, ui-sans-serif, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.1em"
  stamp:
    fontFamily: "Archivo Narrow, Archivo, ui-sans-serif, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.12em"
  data:
    fontFamily: "ui-monospace, Cascadia Mono, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "0.92em"
rounded:
  tape: "2px"
  s: "4px"
  m: "6px"
  l: "10px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.m}"
    padding: "8px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "#2c3436"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.m}"
    padding: "8px 16px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "#f6f7f5"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.paper}"
    rounded: "{rounded.m}"
    padding: "8px 16px"
    height: "40px"
  button-danger-hover:
    backgroundColor: "#8f1e18"
  button-disabled:
    backgroundColor: "#e4e7e3"
    textColor: "#7c8684"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.m}"
    padding: "9px 12px"
    height: "42px"
  panel:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.l}"
    padding: "0 20px 20px"
  tape:
    backgroundColor: "{colors.tape}"
    textColor: "{colors.paper}"
    typography: "{typography.tape}"
    rounded: "{rounded.tape}"
    padding: "5px 8px 4px"
  tape-warn:
    backgroundColor: "{colors.warn}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tape}"
    padding: "3px 6px 2px"
  tag-plate:
    rounded: "{rounded.l}"
    padding: "14px 10px 10px"
  stamp-applied:
    backgroundColor: "{colors.ok-soft}"
    textColor: "{colors.home}"
    typography: "{typography.stamp}"
    rounded: "{rounded.s}"
    padding: "2px 8px"
  stamp-failed:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    typography: "{typography.stamp}"
    rounded: "{rounded.s}"
    padding: "2px 8px"
  stamp-pending:
    backgroundColor: "#fff6d6"
    textColor: "#7a5c00"
    typography: "{typography.stamp}"
    rounded: "{rounded.s}"
    padding: "2px 8px"
  rail:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.rail-ink}"
    width: "232px"
  rail-link:
    textColor: "{colors.rail-muted}"
    rounded: "{rounded.m}"
    padding: "9px 10px"
  rail-link-active:
    backgroundColor: "{colors.rail-raised}"
    textColor: "{colors.paper}"
  tabbar:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.rail-muted}"
  notice-success:
    backgroundColor: "{colors.ok-soft}"
    textColor: "#154f2f"
    rounded: "{rounded.m}"
    padding: "12px 16px"
  notice-error:
    backgroundColor: "{colors.danger-soft}"
    textColor: "#7e1a14"
    rounded: "{rounded.m}"
    padding: "12px 16px"
---

# Design System: FamilyPrism

## Overview

**Creative North Star: "The Key Rack"**

Every family PC is a key tag on the hall rack. Each one is a coloured plate with a steel rim, hung from a ring, with its name punched onto black label-maker tape. Connected PCs hang from a brass and steel hook bar. Offline PCs drop lower, lose their hanger wire and fade toward grey. A stale client version gets a strip of yellow "Update due" tape. You can read the whole household's state at a glance, the same way you'd check which keys are home.

The console runs in Operate mode: it's dense, calm and factual. A painted-slate rail carries navigation, and the active item is marked with brass. The working area is cool plaster with white paper panels. Structure comes from 1px hairlines only. There are no drop shadows and no cards inside cards. Colour is reserved for identity (the six tag colours) and state (home green, offline grey, warn yellow, danger red). Chrome stays neutral so the tags carry the screen.

The world rejects the neutral-sidebar admin template, with its stat tiles and a nine-column table that carries a form in every row. Phones get first-class layouts, not a shrunken desktop: a bottom tab bar replaces the rail, and tables become stacked cards.

**Key Characteristics:**
- Coloured, steel-rimmed key tags with embossed black tape labels, one per PC, with a deterministic colour.
- Position encodes state: home tags hang from the bar, offline tags hang lower and desaturate.
- A slate rail with a brass active indicator and a plaster ground.
- Hairline structure (1px), flat surfaces, and no nested cards.
- Archivo for UI, Archivo Narrow 700 uppercase for tape, system monospace for data.
- One settle swing when tags first appear, and nothing else moves on its own.

## Colors

A restrained slate-and-plaster frame lets six saturated tag colours and a single brass accent do the talking.

### Primary
- **Brass Key** (brass): The rail's active-item bar and active icon, the active tab icon on phones, focus outlines inside the slate chrome, and text selection. It's the only warm accent in the chrome.
- **Iron Ink** (ink): Primary buttons, body text, the step-number discs, and the checked state of picker tiles.

### Secondary (tag identity colours)
- **Signal Red** (tag-red), **Label Yellow** (tag-yellow), **Workshop Blue** (tag-blue), **Garden Green** (tag-green), **Safety Orange** (tag-orange), **Plum Violet** (tag-violet): Tag plate fills, chip dots and picker swatches. Each client gets one colour, chosen by hashing its id into `c0` to `c5`. The colour is personal furniture: it identifies a PC everywhere and never signals state.

### Tertiary (state)
- **Home Green** (home): Connected status dots and text, and the "Applied" stamp.
- **Away Grey** (away): Offline status, drawn as a hollow ring rather than a filled dot.
- **Update Yellow** (warn): "Update due" tape. **Warn Ink** (warn-ink) is the dark partner for text on yellow.
- **Brick Danger** (danger), with **Danger Wash** (danger-soft): Destructive buttons, the danger-zone heading, error notices and the "Failed" stamp.
- **Mint Wash** (ok-soft): Success notice background and the "Applied" stamp background.
- **Focus Blue** (focus): The global 2px focus outline, input focus border and its 3px halo (rgba 31,111,209,0.22). It's also the caret colour.

### Neutral
- **Painted Slate** (rail), **Raised Slate** (rail-raised), **Slate Seam** (rail-line): The rail, the phone tab bar, the sign-in side panel, rail hover and active backgrounds, and dividers inside the rail. The browser theme-color is also Painted Slate.
- **Rail Chalk** (rail-ink), **Rail Haze** (rail-muted): Text on slate, at full strength and muted.
- **Cool Plaster** (ground): The page background, also used for the hole in each tag ring.
- **Paper** (paper): Panels, inputs and secondary buttons.
- **Ink 2 / Ink 3** (ink-2, ink-3): Secondary copy, hints and counts.
- **Hairline / Soft Hairline** (line, line-soft): Panel borders and section rules, and row dividers inside panels.
- **Hook Steel / Dark Steel** (steel, steel-dark): Tag rims, rings, chip-dot rims and hanger wires. The hook bar is a steel gradient (#c4cacc → #9aa3a6 → #7f888b).
- **Label Tape Black** (tape): The embossed name tape.

### Named Rules
**The Colour Is Identity Rule.** Tag colours identify a PC. They never mean online, offline or error. State uses position, the home/away dot, tape and stamps.

**The Brass Is Rare Rule.** Brass appears only on the active navigation item, focus inside the slate chrome, and selection. Its sibling, warn yellow, appears only as "Update due" tape and pending stamps.

## Typography

**Display Font:** Archivo (self-hosted variable 400–700, with system sans fallback)
**Label/Tape Font:** Archivo Narrow 700 (self-hosted)
**Data Font:** System monospace (ui-monospace, Cascadia Mono, SFMono-Regular, Menlo, Consolas)

**Character:** Archivo is a sturdy grotesk, and paired with its narrow bold cut set in tracked capitals it reads like a label maker. Machine facts (versions, IPs, ids) switch to monospace so they look different from human copy.

### Hierarchy
- **Display** (600, clamp(2rem, 3.4vw, 3rem), 1.08, -0.025em): Sign-in side panel headline. The public home h1 uses clamp(2rem, 4vw, 2.75rem).
- **Headline** (600, 2rem, 1.15, -0.02em): Page titles such as "4 of 6 PCs are home". Drops to 1.5rem under 860px.
- **Title** (600, 1.125rem, -0.01em): Panel and group headings, plus the empty-rack heading. The sign-in card h2 is 1.5rem.
- **Body** (400, 0.9375rem, 1.5): Default text, with tabular numerals throughout. Lead and descriptive copy is capped at 62ch.
- **Body small** (0.875rem): Table cells, row lists, facts lists and status text.
- **Label** (600, 0.875rem): Field labels, legends, buttons and the disclosure summary.
- **Hint** (0.8125rem, ink-2): Helper text, counts and figure captions. The tab bar label is 0.6875rem / 600.
- **Tape** (Archivo Narrow 700, 0.875rem, uppercase, 0.1em tracking): Client names on black tape. It's 0.8125rem in chips, 0.9375rem on the detail identity tag, and 0.75rem on the warn tape. The tape has a dual 1px text-shadow embossing (light below, dark above).
- **Stamp** (Archivo Narrow 700, 0.75rem, uppercase, 0.12em tracking): DNS directive status stamps.
- **Data** (monospace, 0.92em): Versions, addresses and `code`.

### Named Rules
**The Tape Is For Names Rule.** Archivo Narrow uppercase tape is reserved for client names and the "Update due" flag. Headings and buttons stay in Archivo, in sentence case.

**The Machine Facts Rule.** Versions, IPs and ids are set in the data font. Human copy never is.

**The Centred Caps Rule.** The Archivo `@font-face` sets `ascent-override: 93%` and `descent-override: 15.8%`, which keeps the same total height but lowers the baseline. Without it, Chrome renders labels about 1px high in flex-centred controls. Keep these overrides; don't compensate with uneven padding.

## Layout

- **Shell:** A two-column grid with a 232px sticky slate rail (full height) and fluid content. The content column `.page` is capped at 1180px, with padding of 28px 40px 64px and a 24px vertical gap.
- **Page head:** Title, optional crumb and a one-sentence status lede on the left, with actions on the right. It ends in a 1px hairline rule.
- **Panels** sit directly on the plaster. Inside a panel, sections are separated by soft hairlines (20px space either side), never by inner cards.
- **Split:** Main and side columns use 1.45fr and minmax(300px, 1fr) with a 24px gap. They collapse to one column under 1080px.
- **Rack:** An auto-fill grid of tags with a 168px minimum, a 28px row gap and a 16px column gap. Each tag draws its own hook-bar segment so wrapped rows still hang from a bar, and the last one extends the rod to the edge.
- **Rhythm:** Common steps are 4, 6, 8, 10, 12, 14, 16, 20, 24 and 28px. Panel padding is 20px, and table cells are 12px × 16px.
- **Under 860px (phones):**
  - The rail becomes a slim sticky top bar holding the brand and "Sign out".
  - Navigation moves to a fixed bottom tab bar (four equal tabs, padded for the safe-area inset).
  - The page gets 104px bottom padding.
  - The rack becomes two columns.
  - Stackable tables become stacked card rows with `data-label` captions, and the whole row is the link target.
  - Fact lists and inline composers become single columns.
  - Sign-in drops the sample rack and lede.
- **Under 560px:** Row lists move their middle column onto a second line.
- **Touch targets:** Crumbs, the rail sign-out link and disclosure summaries get a 44px minimum height. Sign-in buttons are 44px.

## Elevation & Depth

The system is flat. There are no drop shadows anywhere. Depth comes from the physical metaphor instead. Tags hang from a hanger wire and ring, and their vertical position encodes state. Steel rims (3px) and the gradient hook bar suggest metal. Tape uses a tiny emboss text-shadow. Hover lowers a tag plate 2px, as if you pulled it. The only box-shadows are functional: the inset 2px brass bar on the active rail link, and the 3px focus halo on inputs.

### Named Rules
**The Hairline Rule.** All structure is 1px lines in `line` or `line-soft`. If you need separation, add a rule, not a shadow or a nested card.

**The Drop Means Away Rule.** Offline tags sit 22px lower (padding-top 40px instead of 18px), lose their hanger wire, and mix their colour to 22% over grey (#d9ddda) with a lighter rim (#b5bcbe). Never show "offline" with tag colour alone.

## Shapes

- **Corners:** There are four radii:
  - 2px for label tape (crisp, cut-strip edges).
  - 4px for stamps and tag meta windows.
  - 6px for buttons, inputs, notices, picker tiles, rail links and screenshot frames.
  - 10px for panels and tag plates.
- **Circles:** Rings, chip dots, status dots, swatches and step numbers are circles.
- **Offline marker:** The offline status marker is a hollow 1.5px ring. The connected marker is a filled dot.
- **Placeholders:** Empty screenshot slots use a dashed 1px border at 16:9.

## Components

### Buttons
Solid, compact and plain-spoken.
- **Shape:** Gently rounded (6px), with a 40px minimum height, 8px × 16px padding, and an optional 18px icon with an 8px gap.
- **Primary:** An Iron Ink fill with white label text. Hover moves to #2c3436, and pressing nudges the button down 1px.
- **Secondary:** Paper fill with a #aab2ae border. Hover shows an ink border and a #f6f7f5 fill.
- **Danger:** A Brick Danger fill, hovering to #8f1e18. It's used only inside the danger-zone panel and for profile deletion.
- **Disabled:** A #e4e7e3 fill, #7c8684 text and a not-allowed cursor.
- **Link button:** An underlined inline control, used for "Sign out".

### Chips (TagChip)
- **Style:** A 14px dot in the tag colour with a 2px steel rim, followed by the name on black tape (0.8125rem). As a link, the tape lightens to #2c3436 on hover.
- **Use:** It identifies a PC in lists, tables, group members and the attention list.

### Cards / Containers (Panel)
- **Corner Style:** 10px.
- **Background:** Paper on plaster.
- **Shadow Strategy:** None (see Elevation & Depth).
- **Border:** 1px `line`. The danger zone uses a #e3b7b3 border with a danger-coloured heading.
- **Internal Padding:** The head is 16px 20px 12px and the body is 0 20px 20px. Groups stack inside a single panel, divided by hairlines.

### Inputs / Fields
- **Style:** Paper background with a 1px #aab2ae border, 6px radius, 42px minimum height and 9px × 12px padding. Placeholder text is #6c7775. Data inputs use the mono font.
- **Hover:** The border shifts to ink-2.
- **Focus:** A focus-blue border plus a 3px rgba(31,111,209,0.22) halo, with no outline.
- **Labels:** Labels are 600, 0.875rem, sitting 6px above the field. Hints are 0.8125rem ink-2.
- **Picker tiles:** Checkbox tiles sit in an auto-fill 170px grid, each with a tag-colour swatch. A checked tile gets an ink border and a #f4f6f3 fill.

### Navigation
- **Rail:** Links are 0.9375rem / 500 in Rail Haze with 20px icons. Hover shows Raised Slate and white text. The active link (`aria-current="page"`) shows Raised Slate, white text, an inset 2px brass bar and a brass icon. The foot shows "Signed in as" above the sign-out link, divided by a slate seam. Focus outlines inside the rail are brass.
- **Tab bar (under 860px):** A fixed slate bar with four icon-over-label tabs (Home, Clients, Groups, DNS). The active tab has white text and a brass icon.

### Key Tag (signature)
The rack's unit. It's built from these parts:
- A 2px steel hanger wire (22px).
- An 18px steel ring with a plaster hole.
- A plate in the tag colour with a 3px steel rim and 10px radius.
- The name on black tape.
- A 92%-white meta window showing Home or Offline, the last user, and the version (or "Version unknown").
- An optional "Update due" warn tape.

It renders as a link to the client detail page when an `href` is provided. Its aria-label states name, state and last user. Hover darkens the rim to Dark Steel and lowers the plate 2px (220ms ease-out).

**Motion:** On load, home tags in the rack play `tag-settle` once: a 900ms swing from the top pivot (-5° → 2.5° → -0.8° → 0°) using `cubic-bezier(0.22, 1, 0.36, 1)`. It runs only under `prefers-reduced-motion: no-preference`. Offline tags don't swing. Other transitions are 120–220ms colour, border and transform changes on the same ease.

### Label Tape
Embossed black strip (2px radius, 5px 8px 4px padding, ellipsis on overflow). **Warn tape** is yellow with ink text at 0.75rem, and reads "Update due".

### Status and Stamps
- **Status:** Coloured text with an 8px marker. Home is a filled green dot. Offline is a hollow grey ring.
- **Stamps:** Bordered uppercase narrow labels for DNS directive state:
  - Pending and Delivered: amber.
  - Applied: green.
  - Failed: red.
  - Each stamp has a plain-language caption, for example "Queued until the PC connects".

### Notices
A full-width bar with a 20px icon, 1px border and 6px radius. **Success** is a mint wash with deep green text (role=status). **Error** is a danger wash with deep red text (role=alert), and can carry a bulleted error list.

### Tables and Rows
- **Tables:** Header cells are 0.8125rem / 600 ink-2 with a hairline below. Body rows have soft hairlines and a #f6f7f5 hover. The trailing "Open ›" link column is right-aligned. Under 860px, `table.stackable` becomes stacked labelled cards.
- **Row lists:** Rows run chip / text / aside, separated by soft hairlines.
- **Facts lists:** Two-column definition lists.

### Screenshot Frame
A 1px hairline frame with a 6px radius on a near-black backing (#101415). It has a paper caption bar giving the capture time. When there's no screenshot, a dashed 16:9 placeholder takes its place. Clicking the image or the caption's "Enlarge" opens a native `popover` lightbox on a slate scrim, with "Open original" and "Close" actions. Don't use hash or `:target` links here, because the Remix client router uses pushState and `:target` never fires.

## Do's and Don'ts

### Do:
- **Do** give every client its tag colour from `tagClass(id)` (c0–c5) and use it everywhere that PC appears: tag, chip and picker swatch.
- **Do** show offline state by dropping the tag, removing its wire, desaturating the plate and using a hollow status ring.
- **Do** mark stale client versions with yellow "Update due" tape.
- **Do** separate content with 1px hairlines (`line` between panels and sections, `line-soft` within).
- **Do** say plainly that messages to offline PCs are not queued. Examples: "Only PCs that are home get it; messages aren't queued." and "Delivered to 2 of 3 PCs. 1 offline PC won't get it; messages aren't queued." DNS changes, by contrast, are "queued for the next client connection".
- **Do** set versions, IPs and ids in the data font.
- **Do** keep `tag-settle` behind `prefers-reduced-motion: no-preference` and play it once.
- **Do** give phones the bottom tab bar and stacked-card tables under 860px, with 44px touch targets on text-sized controls.

### Don't:
- **Don't** add drop shadows or put cards inside cards.
- **Don't** use tag colours to signal state, or use brass outside active navigation, rail focus and selection.
- **Don't** use tape styling for headings, buttons or anything other than client names and the "Update due" flag.
- **Don't** build stat-tile dashboards or wide tables with a form in every row.
- **Don't** imply that a message will reach an offline PC later.
- **Don't** add looping or decorative motion beyond the one-time settle swing.
