# NOVA interface design guide

Use this guide when designing a screen for the homelab. NOVA should feel like a family of instruments built for the same desk. You should recognize it from the phosphor readouts, the measured spacing, and the way a control responds, even with the logo covered.

## What the pages share

| Keep consistent | Give each app room to invent |
| --- | --- |
| The meaning of color, type hierarchy, spacing scale and focus treatment | The shape of the primary instrument |
| Navigation names, icon meanings and control states | The composition that best serves the task |
| How NOVA looks and behaves while listening, working and speaking | How surrounding data responds to an actual event |
| Units, timestamps and treatment of unavailable data | Charts, diagrams, imagery and background routing |

Start a new screen by finishing this sentence: “I open this page to ___.” Sketch the answer at the largest scale first. In the supplied reference, the brain occupies the center, corner brackets define its viewing area, and small callouts sit close to the features they explain. The narrow rails carry supporting readings. Borrow that hierarchy. On Learning Grove the subject could be a branching concept tree. On a theology reading page it could simply be a beautifully set passage.

## Palette and typography

These are starting tokens for shared styles. The green, amber, primary text and muted text match the existing [design studies](apps/nova-demo/dist/studies/studies.css).

| Token | Default | Use |
| --- | --- | --- |
| `--canvas` | `#0A100E` | Deepest background and empty plotting area |
| `--surface` | `#121E18` | Instrument housing |
| `--line` | `#385344` | Decorative dividers and passive traces |
| `--ink` | `#E2EADF` | Titles, prose and ordinary values |
| `--muted` | `#A6B7AA` | Units, timestamps and secondary labels |
| `--green` | `#A9F8AD` | Measured value, active signal, available capacity |
| `--accent` | `#FFBF73` | Selected item, comparison marker or next action |
| `--danger` | `#FF9992` | Failure or destructive action, paired with an icon and explicit text |

On a budget chart, green can mean dollars spent and amber can mark today's expected spend. Label both. Changing the accent to Glacier or Orchid should move only the accent role. Errors retain their own color and label. Use dark text on bright filled controls. Measure contrast on the actual composited surface, including any image beneath it. Aim for at least 4.5:1 for ordinary text and 3:1 for large text. [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

Use the system sans stack for prose, titles and buttons. Use the demo’s system monospace for time, units, chart ticks and compact state labels. Enable tabular numerals on updating values so adjacent digits stay still. A desktop starting scale is 12 px for annotations, 16 px for body copy, 20–24 px for instrument titles and 40–64 px for a dominant reading. On TV, size the next deadline, time and critical status for the couch. On reading pages, give paragraphs roughly 60–70 characters per line and 1.6 line height.

## Space, surfaces and backgrounds

- Use a 4 px base. Put 4 px between a value and its unit, 8 px between an icon and label, 16 px between related controls, 24 px inside desktop instruments and 32–48 px between major regions. Mobile padding starts at 16 px. Hairlines and optical icon adjustments can use 1–2 px.
- For an inspection screen, try a 3 / 6 / 3 column split for context, subject and detail. On narrow screens, put the subject first and move its controls directly beneath it. For a TV overview, group by viewing priority. For a reading or editing task, use one calm column.
- Use one frame treatment per region. Four open corners suit a viewport, a ruled edge suits a ledger, and a solid enclosure suits an interactive control bank. Reserve the brightest edges for focus and selection. Keep a continuous text area behind long labels.
- Draw the background after placing content. Route a circuit from a real source to its destination using horizontal runs and 45-degree bends. End it at a port, leave a gutter for the trace, and recompute or simplify the route when columns stack. A dot field can suggest scale inside a plot. A quiet, untextured area belongs under a passage or dense table.
- Give each page one distinctive experiment. The TV might use packet motion between rooms. The finance page might align its entire backdrop to the date axis. The guitar app might use the measure divisions of the active song. Keep the text, spacing and interaction rules familiar as the composition changes.

## Choose an instrument by the question

| User question | Instrument and behavior |
| --- | --- |
| What time is it, and how far through the day am I? | Pair exact local time with a 24-hour dial. Put midnight at the top and label noon. Reserve this much space for the clock on glanceable displays. |
| Which lights are on? | Place switches in a simplified floor plan. A lit room gains a local wash and a brightness value. On a phone, offer the same rooms as labeled controls in reading order. |
| Can I spend at this pace? | Compare actual spending with an even-pace marker on one dollar scale. Show the amount left in text. For transaction review, switch to a sortable ledger with aligned amounts. |
| What needs my attention next? | Give the nearest deadline a prominent date and action. Put later work on a dated rail. Use proportional spacing only when the axis truly represents elapsed time. |
| Did something change on the server? | Pair the current reading with a sparkline and time window. Service indicators need a name and status. A stale sample keeps its timestamp and gains a stale label. |
| Where am I in my learning? | Center the selected concept, draw its immediate relationships and put the next lesson beside it. Expand another branch on selection. |
| Is NOVA hearing me? | Reuse the Learning app voice animation as the starting point. Show a steady ready state, input-responsive motion while listening, a distinct processing rhythm, and output-responsive motion while speaking. Give each state a text equivalent. |

## Controls and motion

Use a labeled button for a command, a pressed toggle for a persistent binary setting, tabs for peer views and a slider plus numeric value for intensity. Give primary actions a filled surface. Secondary actions can use a ruled outline. Make keyboard focus visible with a 2 px accent ring and a 3 px offset. Design touch controls with a 44 × 44 px target, including invisible padding around small floor-plan markers.

Respond to input immediately. Try 120–180 ms for a press or selection and 220–350 ms for a state transition. A light switch can send one pulse toward the room while the command is pending. Show the room as on when confirmation arrives. If it fails, keep its last confirmed value and offer retry. Honor reduced motion by replacing travel, sweeps and oscillation with a static highlight and the same state text. Keep ambient movement away from sustained reading.

## Where assets come from

| Need | Source and convention |
| --- | --- |
| Everyday icons | Use Lucide. Dashboard, Finance, Guitar, Homework, Learning and Theology already declare `lucide-react`. Start at 20 or 24 px with a 2 px stroke and `currentColor`. Use the same glyph for the same action across apps. Bundle icons locally and retain upstream license notices. [Catalog](https://lucide.dev/icons/) · [License](https://lucide.dev/license) |
| Brand and voice | Treat the NOVA wordmark and existing voice animation as owned assets. Keep a single editable master for each. Let the voice implementation accept state, level and accent as inputs. |
| Dials, circuit paths, floor plans and charts | Draw these from the underlying data or layout. Use SVG for crisp scales and paths, HTML for controls and accessible readings. Keep bespoke illustrations separate from navigation icons. |
| Patterns and working examples | Start in the local demo. [Signal](apps/nova-demo/dist/studies/signal.html) explores voice, [Switchboard](apps/nova-demo/dist/studies/switchboard.html) explores routing, and the [TV dashboard](apps/nova-demo/dist/studies/tv.html) brings instruments together. The [palette picker](apps/nova-demo/dist/studies/palette.js) contains the accent presets. |

**Proposed shared home:** When migrating the first two apps, put common tokens, owned SVGs and motion styles in a repo-level `packages/nova-ui/` directory. Export plain CSS variables and SVG assets so static HTML and React can consume the same files. Keep interactive React components in a separate entry point. Record the source and license alongside third-party assets. The demo is the current workshop. Promote a pattern to the shared collection once two real screens can use it with the same meaning.

## Review a new page

1. From across the room or at phone width, can you identify the subject and its most important value?
2. Does each bright edge, colored marker or animation explain a state, relationship or action?
3. Can you use the primary control with a keyboard and understand its result with motion disabled?
4. Does the layout survive a long title, missing value, stale connection and an alternate accent?
5. Put the page beside a different NOVA app. Which details identify them as siblings, and which instrument makes this page worth opening?
