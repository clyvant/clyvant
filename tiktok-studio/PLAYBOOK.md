# Faceless psychology on TikTok — playbook (US first, France second)

_Prepared 2 Nov 2026 for Clyvant. Status of each claim is marked: **verified**, **hypothesis**, or **to measure**._

## 1. What we know about the competitors

| Account | What's verified | What's not |
|---|---|---|
| @orythum | A YouTube channel of the same name describes itself as *"philosophy, psychology, intelligence, and the uncomfortable truths of human nature… exploring the hidden depths of the human mind"*. A TikTok #psychology tag page lists an orythum clip about emotionally intelligent people feeling lonely. **verified** | Follower growth, views, the videos themselves, and that the YouTube and TikTok accounts are the same owner. |
| @cryothum | Nothing public found (searched TikTok, YouTube, Instagram, Social Blade, Exolyt, spelling variants). | Everything. |

**Why the videos weren't analysed yet:** this cloud environment's network policy blocks `www.tiktok.com`
(and ElevenLabs). Allow those domains (environment settings → Network access) and start a new session,
then run `analysis/analyze.py` (see README). It measures, for every video: views/likes/comments/shares,
length, cuts per 10 s, time to first cut, loudness, words per minute, the first 3 s of voice-over, and
saves the hook frames + a contact sheet so the visual style can be studied frame by frame.

Everything below is the system we built for this niche from research and platform rules. It is designed
so that once the competitor numbers are in, we adjust pacing, hooks and style in `script.json`/`comp.js`
and re-render, without rebuilding anything.

## 2. Psychological targeting (why this niche spreads) — hypothesis, to measure

The "uncomfortable truths about human nature" format converts viewers into commenters and sharers because
it does four things at once:

1. **Identity validation** — "this is me" (feeling watched, feeling misunderstood, replaying moments at 3 a.m.).
   Viewers comment to claim the identity and share to say "this is you".
2. **Relief** — a reframe that removes shame ("nobody noticed — that's freedom"). Relief is what gets saved.
3. **Protection** — "know the script" content (manipulation tactics) is saved and sent to friends.
4. **Credibility** — a named study, a university, a year, a real number. It separates the account from
   pop-psych myths and survives fact-checking in the comments.

Rules we follow so the account stays monetisable and trusted:
- Every claim maps to a real, replicated finding (spotlight effect, illusion of transparency, liking gap,
  beautiful-mess effect, peak-end rule, foot-in-the-door, door-in-the-face, reciprocity, variable
  reinforcement, DARVO). **Avoid** debunked staples: power posing, ego depletion, "93% of communication is
  nonverbal", learning styles, left/right-brain personalities, eye-direction lie detection, "21 days to
  form a habit", Stanford Prison Experiment as proof of human evil, marshmallow test "predicts success".
- No armchair diagnosis ("signs your partner is a narcissist"). Dark psychology is always framed as
  recognising and defending, never as a how-to.

## 3. The hook system (first 3 seconds)

Three hooks that must say the same thing at the same time (visual, on-screen text, voice):

| Layer | Rule | US-01 example |
|---|---|---|
| Visual hook (frame 0 = cover) | A single striking 3D image that *is* the idea, moving from frame 0, with a hard sound at t=0 | A lone figure under a spotlight ignites with a boom |
| Text hook (top of frame, ≤ 9 words) | Visible on frame 0, readable with sound off, inside the safe area | "Nobody is watching you as closely as you think." |
| Voice hook (≤ 2.5 s) | A counter-intuitive statement or an open loop, not a question | "You think everyone noticed. They didn't." |

Then **re-hook every ~15 s** with a number, a reveal or a promise: "The real number?", "And it goes
deeper", "Number four is why you can't walk away".

## 4. Script structure for 60–105 s (Creator Rewards needs > 60 s)

1. **Hook** (0–3 s) — the uncomfortable claim.
2. **Proof** (3–20 s) — the study: who, where, when, what they did. On-screen citation card.
3. **The number** (20–25 s) — the reveal, visualised in the scene itself (the audience lights up: 50% guessed vs 23% noticed).
4. **Name it** (25–28 s) — the concept as a title slam (searchable term).
5. **Mechanism** (28–50 s) — why your brain does this, with 1–2 vivid everyday examples.
6. **Second layer** (50–60 s) — "and it goes deeper": a related finding.
7. **Reframe** (60–70 s) — the emotional turn: shame → freedom / fear → control. Music changes mood here.
8. **CTA + loop** (last 5 s) — follow/save + a question that invites a personal story; last frame cuts back to the first.

## 5. Visual language (what the code renders)

- **3D, faceless mannequins** — universal "you", no faces to cast, no AI-likeness issues. One light source
  (spotlight), fog, film grain, vignette. Real camera moves every 1.5–3 s; never a static image (static
  slideshows and looping clips are excluded from Creator Rewards).
- **Data inside the scene** — percentages become lit people, tactics become props (door, slot machine,
  marionette strings).
- **Typography** — Poppins 800 captions, 1–3 words, uppercase, active word highlighted, black stroke;
  one accent colour per series (gold = psychology that frees you, red = dark psychology). Study cards,
  stat bars and chapter numbers in the same system. All key text inside the TikTok safe area
  (top 230 px, bottom 490 px and right rail kept clear).
- **Sound** — deep, calm narrator (~150–165 wpm) with pauses before reveals; an SFX on every visual
  event (whoosh on cuts, impact on numbers, riser into reveals, ticks on list items, heartbeat for
  emotion); music −18 dB, ducked under the voice, mood switch at the reframe; master −14 LUFS.

## 6. Creator Rewards — rules that shape every video (verified, Nov 2026)

- Personal account (not Business), 18+, ≥10k followers, ≥100k views in the last 30 days.
- Videos **over 1 minute**, **original**; payouts count **qualified views** (For You feed, ≥5 s, ≥1,000 per video).
- RPM factors: originality, play duration (watch time + completion), **search value**, engagement.
  Put the searchable term on screen and in the caption ("spotlight effect", "social anxiety",
  "manipulation tactics", "dark psychology").
- Excluded: duets/stitches, photo mode, looping/slideshow/text-only videos, unoriginal or reposted
  content, and **sponsored/ad content** — keep product promotion on a separate account.
- Label realistic AI-generated content with TikTok's AI label. Our visuals are stylised 3D, but the
  voice is synthetic: turn the label on to be safe. Never clone a real person's voice.
- **Copying the competitor's videos or scripts would get the account flagged as unoriginal.** We copy
  the *strategy* (topics, hook system, structure, pacing, style), never the content.

## 7. Posting plan (first 30 days) — to measure

- 1–2 videos/day. A series name in the first caption line ("Psychology that sets you free · #1").
- For each script, render 3 hook variants (swap the `hook` beat + headline) and keep the winner
  (2 s / 6 s view rate, completion, shares per 1k views).
- Pin a comment that repeats the question. Reply to early comments within the first hour.
- Read TikTok Analytics → follower activity to pick 2–3 time slots; rotate for two weeks before fixing.
- Topic queue (all grounded): liking gap · beautiful-mess effect · peak-end rule · negativity bias ·
  mere-exposure effect · loneliness & health (Holt-Lunstad 2015) · reciprocity · foot-in-the-door ·
  door-in-the-face · variable reinforcement · DARVO · hedonic adaptation (with its caveats).

## 8. France — what changes (verified research + recommendations)

- Creator Rewards is available in France (same eligibility, > 1 min). TikTok Shop France has been live since 31 Mar 2025.
- **Write natively, don't translate**: informal *tu*, French typography (space before ? ! :, « »),
  French concept names (*l'effet projecteur*, *l'illusion de transparence*). FR-01 is written this way.
- Tone: closer to *vulgarisation scientifique* (TikTok's STEM feed is active in France) and philosophy
  (Camus, Montaigne, the Stoics) than American self-help hype; fewer words per card; always subtitled.
- Voice: a native metropolitan-French voice in a calm explainer register — test male vs female.
- Law: if a video is commercial, it must be identifiable as an ad (« Publicité » / « Collaboration
  commerciale »). AI-generated realistic faces/silhouettes need « Images virtuelles » in sponsored content.

## 9. If the goal includes product sales (e.g. Hillside Shilajit)

Keep two lanes: the psychology account earns Creator Rewards; product videos live on the brand/affiliate
account with the commercial-content toggle on. Supplement claims are tightly restricted in both markets
(US: FTC substantiation + FDA structure/function rules + TikTok Shop policy; France/EU: no authorised
health claim exists for this formula, ANSES warning on ashwagandha). The research notes with the full
phrase lists are summarised in the session report — ask for `COMPLIANCE.md` before scripting any product video.

## 10. Next steps

1. Allow `www.tiktok.com`, `*.tiktok.com`, `*.tiktokcdn.com`, `*.tiktokcdn-us.com`, `*.tiktokv.com`,
   `api.elevenlabs.io` and add `ELEVENLABS_API_KEY`; start a new session on this branch.
2. Run `analysis/analyze.py` on both competitors; compare their median length, cuts/10 s, first-cut time,
   wpm and hook wording against ours; adjust `script.json` + camera timing to match the winners.
3. Re-render all three videos with ElevenLabs (`./build.sh videos/<id>`), choose the French voice.
4. Produce the next 5 topics from the queue; A/B test hooks; review analytics weekly.
