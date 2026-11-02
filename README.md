# LoopEight

Eight-bar loop expander desk for bedroom producers and AI-music finishers stuck in loops.

Producers finish less than half their music. The #1 struggle is finishing (79%). The 8-bar loop trap is real. LoopEight takes your chord progression, BPM, and key, then writes a short full form — sparse intro, full verse, emphasized hook — with live FluidR3 instruments so the idea has somewhere to go.

Live chairs only: piano, nylon guitar, upright bass, kit (samples pinned to PreEight commit d58301e).

Distinct from TagFour (last-line end tag), ModEight (last-chorus key change), LiftTwo (pre-hook lift), PreEight (musical pre-chorus), AfterHook, EndEight, LastHook.

## Form

1–4 intro (sparse) · 5–12 verse (full) · 13–16 hook (emphasized)  
Or loop the 8-bar version.

## Play

* A · Loop (8 bars)
* B · Full form (16 bars)

## Pricing

Free. (Future one-time $19 on Gumroad once license gate is connected.)

## Stack

Static HTML/CSS/JS. Deploy on Vercel team `release-forge`.

Samples CDN pinned to SHA: `https://cdn.jsdelivr.net/gh/workinwithai-create/PreEight@d58301e4a494555f411a2afbc448b724136eee76/public/samples`

## Acceptance

Follows WorkinWithAI Audio Engine Rules: lookahead scheduler on AudioContext clock, live state, OfflineAudioContext exports at sample 0, exact length, tail fold, peak ≤ -1 dBFS, matching MIDI.

Exports implemented. Mobile tap-to-start and visibility stop present. License gate pending for paid version.