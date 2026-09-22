# Project Atlas file-sharing vignette

A self-contained, browser-based simulation of a Microsoft Teams–style file-sharing
interaction, built for an 8-condition (2×2×2) between-subjects experiment. The
participant sees a realistic file list, shares a file with "Jordan Lee," and
encounters a system-generated sharing check inside the normal Share dialog —
never a survey question, never a separate page.

The active condition is chosen entirely from three URL parameters
(`ambiguity`, `warrant`, `share`), so the same static site serves all eight
cells with no server and no per-participant editing.

```
https://<your-host>/?ambiguity=1&warrant=0&share=1
```

## Files

- `index.html` — static markup for the Teams-like shell and the Share dialog
- `style.css` — all visual styling (Teams-like look; identical across conditions)
- `script.js` — condition parsing, the `scenarios` content object, and UI logic
- `README.md` — this file

No build step, no dependencies, no backend.

## 1. Running locally

Because the page uses `fetch`-free vanilla JS and only reads `window.location`,
opening `index.html` directly in a browser works for a quick look, but to test
URL parameters reliably use a static server from the project folder:

```bash
# any static server works; two common options:
python -m http.server 8080
# or
npx serve .
```

Then visit, e.g.:

```
http://localhost:8080/?ambiguity=0&warrant=0&share=0
```

## 2. Deploying to GitHub Pages

1. Push this folder to a GitHub repository (root, or a `/docs` folder if you
   prefer — adjust the Pages source accordingly).
2. In the repo, go to **Settings → Pages**, set the source branch (e.g. `main`)
   and folder (`/` or `/docs`), save.
3. GitHub publishes the site at `https://<user>.github.io/<repo>/`.
4. Confirm the eight condition URLs load correctly (see below).

## 3. The eight condition URLs

| ambiguity | warrant | share | key | Example URL |
|---|---|---|---|---|
| 0 | 0 | 0 | 000 | `?ambiguity=0&warrant=0&share=0` |
| 0 | 0 | 1 | 001 | `?ambiguity=0&warrant=0&share=1` |
| 0 | 1 | 0 | 010 | `?ambiguity=0&warrant=1&share=0` |
| 0 | 1 | 1 | 011 | `?ambiguity=0&warrant=1&share=1` |
| 1 | 0 | 0 | 100 | `?ambiguity=1&warrant=0&share=0` |
| 1 | 0 | 1 | 101 | `?ambiguity=1&warrant=0&share=1` |
| 1 | 1 | 0 | 110 | `?ambiguity=1&warrant=1&share=0` |
| 1 | 1 | 1 | 111 | `?ambiguity=1&warrant=1&share=1` |

Any missing or invalid parameter defaults to `"0"` and logs a console warning —
it never blocks rendering, so a malformed link still shows a (defaulted)
condition rather than a blank page.

## 4. Qualtrics integration

### Option A — Embedded iframe (simplest)

Add a **Text/Graphic** question (or a **Content** block) in Qualtrics, switch
to the rich text HTML view, and insert:

```html
<iframe
  src="https://<your-host>/?ambiguity=${e://Field/ambiguity}&warrant=${e://Field/warrant}&share=${e://Field/share}"
  style="width:100%; height:640px; border:0;"
  title="File sharing task">
</iframe>
```

`ambiguity`, `warrant`, and `share` must already exist as Embedded Data fields
containing `"0"` or `"1"` (see randomization below) — Qualtrics substitutes
`${e://Field/...}` into the `src` before the page renders.

### Option B — Qualtrics JavaScript (more control, needed for event capture)

In the question's **JavaScript** editor:

```javascript
Qualtrics.SurveyEngine.addOnload(function () {
  var amb = "${e://Field/ambiguity}";
  var war = "${e://Field/warrant}";
  var sha = "${e://Field/share}";
  var url = "https://<your-host>/?ambiguity=" + amb +
            "&warrant=" + war + "&share=" + sha;

  var iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.style.width = "100%";
  iframe.style.height = "640px";
  iframe.style.border = "0";
  iframe.title = "File sharing task";
  this.getQuestionContainer().appendChild(iframe);

  var qThis = this;

  // Listen for events posted from the vignette (see section 5).
  window.__vignetteListener = function (event) {
    if (!event.data || event.data.source !== "securitycopilot-vignette") return;
    var e = event.data;

    // Store every event as it arrives, and store the final action distinctly
    // so it is easy to pull into analysis without parsing a JSON blob.
    Qualtrics.SurveyEngine.setEmbeddedData(
      "vignette_last_event", e.event
    );
    if (e.event === "final_action") {
      Qualtrics.SurveyEngine.setEmbeddedData("vignette_action", e.data.action);
      Qualtrics.SurveyEngine.setEmbeddedData("vignette_overridden", String(e.data.overridden));
      Qualtrics.SurveyEngine.setEmbeddedData("vignette_decision_time_ms", String(e.data.decisionTimeMs));
      // Auto-advance the survey once the participant has decided.
      qThis.clickNextButton();
    }
  };
  window.addEventListener("message", window.__vignetteListener);
});

Qualtrics.SurveyEngine.addOnUnload(function () {
  if (window.__vignetteListener) {
    window.removeEventListener("message", window.__vignetteListener);
  }
});
```

This both records data and can auto-advance the survey on `final_action` —
remove the `clickNextButton()` call if you'd rather let the participant click
Next themselves.

### Randomizing the three parameters in Qualtrics

1. Create three Embedded Data fields (Survey Flow → **Add a New Element Here**
   → **Embedded Data**): `ambiguity`, `warrant`, `share`.
2. Above the vignette block in Survey Flow, add a **Randomizer** element that
   randomly evaluates one of the 8 paths, each setting the three fields via
   its own Embedded Data element — e.g. path "110" sets `ambiguity=1`,
   `warrant=1`, `share=0`. Set the randomizer to "Evenly Present Elements" for
   balanced assignment across participants.
3. Alternatively, use three independent randomizers (one per factor, each with
   two 50/50 paths) if you want the factors randomized independently rather
   than as 8 fixed combinations.

## 5. Behavioral data capture

Every interaction is logged locally (`window.__vignetteLog`, viewable in
DevTools) and — when the page is embedded in an iframe — posted to the parent
window via `postMessage` with `source: "securitycopilot-vignette"`. Events
fired, in order:

| Event | When | Key payload fields |
|---|---|---|
| `vignette_loaded` | On page load | `conditionKey` |
| `share_initiated` | Share icon clicked, dialog opens | — |
| `recipient_selected` | Jordan Lee chosen from the suggestion | `recipient` |
| `message_displayed` | Sharing Check appears in the dialog | `representation`, `shareAllowed` |
| `send_clicked` | Send button clicked | `overridden`, `decisionTimeMs` |
| `cancel_clicked` | "Cancel" clicked | `decisionTimeMs` |
| `modal_dismissed` | Dialog closed via X or backdrop before a decision | `atState` |
| `copy_link_clicked` | Copy link clicked | — |
| `final_action` | Always fires once, after Send or Don't-share | `action` (`"sent"` / `"not_sent"`), `overridden`, `decisionTimeMs` |

`decisionTimeMs` is the time from when the sharing check first became visible
to when the participant clicked Send/Cancel — the primary
"diagnosticity"/behavioral-latency measure. `overridden` is `true` whenever
the participant sent the file despite `share=0` (i.e., the action disagrees
with the scenario's ground-truth outcome, `shareAllowed`) — no recommendation
is ever shown to the participant (see §7), so `overridden` measures whether
their unaided decision matched the correct policy outcome, not whether they
defied a stated system opinion. This is intentionally *not* prevented.

Every event also carries `condition`, `ambiguity`, `warrant`, `share`, a
`tSinceLoadMs` timestamp, and an ISO `timestamp`, so you can reconstruct full
timing without cross-referencing anything else.

If you are not embedding via iframe (e.g. testing standalone), the same data
is available by reading `window.__vignetteLog` directly, or by wiring your own
`window.addEventListener("message", ...)` if you nest the page yourself.

No database is required or used — Qualtrics Embedded Data is the system of
record, exactly as specified.

## 6. Debug mode

Add `&debug=1` to any condition URL:

```
?ambiguity=1&warrant=1&share=0&debug=1
```

This reveals a small fixed panel (bottom-right) showing the resolved
condition key, the three raw bit values, the current UI state, and a live
event log — useful for QC-ing all eight conditions before fielding the study.
Omit `debug` (or set it to anything other than `"1"`) and the panel never
renders; participants never see it.

## 7. Condition table — what each of the 8 conditions actually shows

All eight conditions share: the same file ("Project Atlas – Q3 Pricing.xlsx"
— kept identical across all conditions since this is a between-subjects
design, so no participant ever compares file names across conditions), the
same file row UI, the same recipient (Jordan Lee), the same Share-dialog
layout, and the same button labels. Only the two rows below differ by
`ambiguity` (which underlying scenario) and by `warrant` (fact list vs.
connected narrative).

| Key | ambiguity | warrant | share | Representation shown | Ground-truth outcome (not displayed) |
|---|---|---|---|---|---|
| 000 | Low | Facts | Cannot | 8-row fact list | Cannot share |
| 010 | Low | Warrant | Cannot | 1-paragraph narrative | Cannot share |
| 001 | Low | Facts | Can | 8-row fact list | Can share |
| 011 | Low | Warrant | Can | 1-paragraph narrative | Can share |
| 100 | High | Facts | Cannot | 8-row fact list | Cannot share |
| 110 | High | Warrant | Cannot | 1-paragraph narrative | Cannot share |
| 101 | High | Facts | Can | 8-row fact list | Can share |
| 111 | High | Warrant | Can | 1-paragraph narrative | Can share |

**No recommendation or claim is shown to the participant.** The panel ends
after the fact list or narrative — there is no "Recommendation:" line, no
colored claim box, nothing that tells the participant what the system thinks
they should do. The participant reads the facts or narrative and decides for
themselves whether to Send or Cancel. The `claim` string and `shareAllowed`
flag still exist in `scenarios` (script.js) and are still logged with every
event (see §5) as the scenario's ground-truth outcome, purely so you can
score each participant's decision against it — they are never rendered.

The recipient's organization (Apex Consulting) is shown only as contact
metadata in the People Picker suggestion when selecting "Jordan Lee" — it is
not one of the propositions inside the Sharing Check panel, so it does not
appear in either the fact list or the narrative for any condition. The file
name is likewise not repeated as a fact row — it is already the dialog title
("Share \"<fileName>\"").

Underlying propositions per pair (000/010, 001/011, 100/110, 101/111) are
identical — only their linguistic organization changes. All wording is taken
directly from the provided scenario library (Study 2 Scenario Library,
Sections C–D).

**The fact-list schema is identical at both ambiguity levels**, in the same
order: Project, Classification, Recipient, Recipient status, Project
membership, Nondisclosure agreement, Policy, Exception. Low-ambiguity
scenarios have no NDA and no exception clause, so those two rows read
"None" rather than being dropped — the low/high difference is in the
*values* and how they relate (one membership relationship vs. several
interacting attributes), never in which categories of information appear.
"Sharing policy" / "External-collaborator policy" and "Confidential-file
policy" / "File eligibility" were also unified to plain "Policy" / "Exception"
so the same label means the same thing in both ambiguity levels. Policies are
not given their own names (e.g. no "(External-Collaborator)" prefix) — the
Exception row refers back to "the sharing policy" generically, since only one
Policy row is ever shown above it in the same panel and a name isn't needed
to disambiguate which policy is meant.

## 8. How experimental equivalence is preserved

- **File / sender / recipient / ground-truth outcome are fixed by `share`,
  not by `warrant`.** The `warrant=0` and `warrant=1` entries for a given
  `ambiguity`+`share` pair in `scenarios` (script.js) use byte-for-byte the
  same `facts` array and the same `claim`/`shareAllowed` ground truth — only
  `representation` differs, and only that field decides whether the fact list
  or the narrative paragraph is rendered. Nothing about the interface, the
  recipient, the file name, or the underlying outcome branches on `warrant`.
- **No new information in the warrant condition.** `warrantText` for each
  scenario paraphrases the same `facts` entries in prose — every clause in the
  narrative traces to one of the fact rows in the same object. Nothing is
  added (no probabilities, no extra policies, no hedges).
- **No recommendation is shown in either representation.** Neither the fact
  list nor the narrative renders a "Recommendation:" line or any claim text —
  the panel ends with the last fact row / the last sentence of the narrative.
  `claim` and `shareAllowed` exist only as logged ground truth (see §5, §7);
  the participant makes an unaided decision from the facts or narrative alone
  in every condition.
- **Same interaction sequence in all 8 conditions.** `script.js`'s state
  machine (open → select recipient → check → decide) does not branch on
  condition at all; only the *content* of the security panel and the file
  name/label vary. There are no extra clicks, no extra screens, and no
  condition-specific button labels.
- **Ambiguity is manipulated by *which* base scenario is loaded** (low: one
  membership relationship; high: membership + NDA + classification + a
  named exception/exclusion), never by making one condition's UI or amount of
  chrome different — both ambiguity levels use the identical dialog and
  identical number of UI steps.
- **`share` does not create a hard block.** `share=0` disables nothing: the
  Send button stays enabled and a same-sized "Cancel" button appears
  alongside it regardless of condition, so choosing to send is always
  behaviorally available and is logged (`overridden: true` when it disagrees
  with the scenario's ground-truth outcome) rather than prevented. This
  matches the requirement that Cannot-share not read as a forced/blocked
  action — and now that no recommendation is displayed, there is nothing
  visible to "override" in the first place; the participant is simply making
  a decision, not disagreeing with a stated system opinion.
- **Visual real estate.** The fact list and the narrative paragraph render
  inside the same fixed-width `.security-panel-body` container with the same
  padding, font size, and line height — the box is not resized or restyled
  based on `warrant`.

### A caveat carried over from the scenario brief

The scenario materials explicitly flag that word-count matching between the
fact list and the narrative should be validated empirically before fielding
(Section G.5 of the brief), and that ambiguity should be pretested rather than
assumed. Tightening the narrative to drop *redundant* "Project Atlas" mentions
(each narrative still names the project exactly once, matching the fact
list's single `Project: Project Atlas` row) and the unmirrored
pricing-content clause (see §9's proposition audit below) made the narrative
noticeably shorter than the fact list at both ambiguity levels (facts: 29–44
words; narrative: 25–39 words) — the two representations are no longer close
to word-count parity. No filler was added to force a
length match, per the brief's explicit instruction against padding either
side; if a pretest indicates length is confounding perceived ambiguity or
difficulty, tighten or expand the wording in the `scenarios` object in
`script.js` (see §9) rather than changing the interface.

### Keeping facts and warrant limited to the same propositions

Every edit to a `warrantText` should be checked against its paired `facts`
array proposition-by-proposition — it's easy for a rewording ("make this
sentence read better") to accidentally add a detail that lives only in prose,
or to leave in a phrase that no longer has a matching fact row after the
facts side changes. Concretely, for each pair (000/010, 001/011, 100/110,
101/111): every noun phrase in the narrative should trace to a `facts` row
value (or the `claim`, which is logged but never displayed — see §7), and
nothing in the narrative should describe an attribute the facts array doesn't
have a row for. One thing stays intentionally asymmetric per the note below:
`"None"`-valued rows (NDA / Exception at low ambiguity) that the narrative
simply never mentions.

### A note on the "None" rows introduced by field standardization

Standardizing the fact-list schema (§7) means the low-ambiguity fact list
(000/001) now states two propositions the narrative never mentions:
"Nondisclosure agreement: None" and "Exception: None." This is intentional —
those concepts genuinely don't apply to the low-ambiguity scenario, and
stating that explicitly keeps the field *schema* constant across ambiguity
levels so a difference in behavior can't be attributed to which categories of
information appeared. It does mean the fact list is not a strict word-for-word
superset/subset match of the narrative for those two rows (the narrative's
silence implies "not applicable"; the fact list states it outright). If exact
proposition-count parity between representations matters more to you than
schema parity across ambiguity levels, the alternative is adding a short
clause to the 010/011 narrative (e.g., "...with no nondisclosure agreement or
exception involved") — not done here since it wasn't requested and reads
awkwardly for a scenario where those concepts are simply irrelevant.

Only the high-ambiguity Cannot-share narrative (110) keeps an explicit
"However," — because that scenario has a genuine logical contrast: the
membership + NDA facts would normally *permit* access, but the file's
Confidential classification is an exception that reverses that. The other
three narratives (010, 011, 111) join their two facts with a plain "and" /
two short sentences instead, because in those cases the facts reinforce each
other rather than conflict (not-a-member + members-only-policy; member +
members-may-share; member+NDA + internal-file-is-eligible) — a "However"
there would signal a contrast that isn't actually present in the underlying
facts. In every narrative, the fact list (which never uses connectives, just
a flat labeled list) presents the identical facts with no relationship
between them made explicit; the narrative's job is to state that
relationship in prose, using "However" only where the facts actually
disagree and "and"/two sentences where they agree.

## 9. Editing scenario wording or researcher settings

Everything content-related lives at the top of `script.js`:

- **`CONFIG`** (recipient name/org, button labels, timing delays, Qualtrics
  `postMessage` target origin) — edit freely; nothing else needs to change.
- **`scenarios`** — one object per condition key (`"000"`…`"111"`), each with
  `fileName`, `modifiedLabel`, `representation` (`"facts"` or `"warrant"`),
  `shareAllowed`, `facts` (array of `[label, value]` pairs), `warrantText`,
  and `claim`. Edit any field directly; the UI logic never hard-codes wording.
  `shareAllowed`/`claim` are logged as ground truth but never rendered (§7) —
  edit them to keep the data correct, not because they change what's on screen.

No other file needs to change to update scenario text, recipient name, or
button labels.

## 10. Known constraints

- Chromium/Edge, Firefox, and Safari (recent versions) are all supported —
  the page uses only standard DOM APIs, `URLSearchParams`, and CSS Grid/Flex.
- The `postMessage` target origin defaults to `"*"` for local testing
  (`CONFIG.qualtrics.targetOrigin` in `script.js`). If you know the Qualtrics
  survey's exact origin ahead of deployment, set it explicitly there to avoid
  broadcasting event data to any embedding page.
- The vignette assumes it is the *only* iframe posting messages with
  `source: "securitycopilot-vignette"` to the parent; the Qualtrics listener
  filters on that field, so it is safe to have other iframes/questions on the
  same page.
