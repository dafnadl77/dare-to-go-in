# Contrast and responsive check (stage 2 follow-up)

Branch `upgrade/22`. Local only: stub API and stub Supabase, nothing contacted the live project.

## Method (contrast)

For every screen state the harness (scratch tooling, not part of the repo) lists each visible text box (position, colour, size),
hides all text, takes a screenshot of the background only (video, scrims, chip fills, halos) and computes the WCAG ratio per box
from the real pixels. The number reported is the worst case: the brightest 10% of the pixels under the box. Normal text needs
4.5:1, large text (24px, or 18.66px bold) needs 3:1.

## What failed and what was done

Text floats directly on the cloud footage and on the dream picture. Measured failures: lines over the lit cloud banks, the
header over the lit water of the dream picture, and the hold screen label/heading over the bright reflection on a phone.

A text-shadow does not count for contrast and buttons stay unfilled (approved design), so the fix is a soft edge-less wash of
the night-sky colour directly behind the words (pseudo-elements only; words, layout, motion unchanged):

- `src/hero/TextHalo.css`: interpretation thoughts, grounding line, choice rows and buttons, feelings step texts, closing hint,
  opening heading, hold label, "I'd rather type".
- `src/ui/GlobalHeader.css`: wordmark, nav links and language switch.

## Result

Journey (opening, picture reveal, moment choice, association, feelings, chosen feelings, interpretation, closing) in Hebrew and
English at 1280x800 and 375x812: no text box below its ratio after the change (the interpretation was also measured at four scroll
positions on the English phone). Pages measured: archive, packages and about in Hebrew (desktop and phone) and in English (phone); dream detail
(three scroll positions) and privacy in English (phone only).

## Not measured

Tablet journey (768), English desktop pages, sign-in and save panels, hover/focus states, the typing screen while text is being
entered, video frames other than the ones captured (the clouds move; the picture is a still).
