# Character performance production brief

**Deliverable:** thirty recognisable kids whose sculpt, motion and voice still read as themselves after the shared rig, team tint and baseball verbs are applied.

This packet is generated from `scripts/v2/character-directions.mjs`; edit that source and run `npm run export:performance-brief`. The roster copy remains owned by `src/data/characters.ts`, and runtime acting families remain owned by `src/v2/render/performance.ts`.

## Delivery contract

- Models replace `public/v2/models/kid_<id>.glb` and must pass `npm run validate:models`; deliver in batches of five or six after one signed-off pilot.
- Shared baseball mechanics remain in `anims_recess_v1.glb`. Bespoke takes go in a partial `anims_<id>_v1.glb`; included clip names override shared motion for that kid only, and omitted names keep the shared library.
- The default voice path is free local Kokoro inference through `npm run generate:ai-voice`: audition named stock voices, record the selected voice and speed in `scripts/v2/ai-voice-cast.mjs`, then use `--ship <ids>`. Never clone, imitate or condition on a real person’s voice without documented rights and consent.
- Voice masters are clean 48 kHz/24-bit mono PCM WAV, delivered as `assets/v2/voice-delivery/kids/<id>.wav` and checked with `npm run validate:voice-delivery -- <ids>`. Runtime copies are mono MP3 named `public/v2/audio/voices/kids/<id>.mp3`; preserve the authored line exactly and disclose AI-generated performances in the product.
- A human performer remains an optional future replacement. Adults may perform; if a minor performs, obtain guardian consent and follow the production jurisdiction’s child-performer and data-retention rules.
- Review every model and motion at hero scale and at 40 px. Review every voice line in the draft flow, not only in isolation.
- Provenance lives in `assets/v2/source/character-provenance.json`: `npm run record:provenance` derives what baked each take and voice from the shipped bytes, and the `recorded` block is signed by the maintainer alone — `scripts/v2/provenance.lint.test.js` refuses an agent’s name there.

## Review order

Pilot Junebug, Theo and Zoom first. For each, sign off the model, the listed partial animation takes and the draft line together; a beautiful sculpt with a generic read is not an accepted character. Then deliver the remaining cast in the roster batches below.

### 1. Junebug Halloran `nostrike`

> Never misses. Ever.

- **Runtime direction:** batter hero · fierce spirit · steady tempo
- **Priority takes:** `bat_stance` · `idle_fidget` · `cheer_fierce` · `upset_fierce`
- **Sculpt:** Compact and accuracy-first: pull the ponytail and headband into one clean arrow shape, keep the eyes narrow and alert, and let the striped athletic top feel neat rather than decorative.
- **Motion:** Use stillness as confidence. Junebug wastes no motion, stops the bat waggle when she decides, and lets one tiny satisfied shoulder release carry the win instead of a broad victory dance.
- **Casting:** A clear, grounded young girl voice with a low centre and precise consonants; confident without sounding older than the other kids.
- **Line:** “Smart pick. I literally never miss!”
- **Read:** Begin dry and matter-of-fact, clip “literally” cleanly, then allow the smallest real smile to appear on “miss.”
- **Avoid:** a gifted-child stereotype, sing-song cuteness, smugness, or an announcer finish.

### 2. Mars Delacruz `calls_shot`

> Calls her shot. Usually wrong.

- **Runtime direction:** swagger hero · goofy spirit · quick tempo
- **Priority takes:** `pose_card` · `idle_fidget` · `cheer_goofy` · `upset_goofy`
- **Sculpt:** Build a broad wedge-shaped face, oversized cap silhouette and open jacket front that all point outward; Theo should look as if his chest enters the frame one beat before the rest of him.
- **Motion:** Every entrance is already a performance. He points before he has an audience, overcommits to the hero pose, and catches his own balance half a beat late without ever losing belief.
- **Casting:** A bright, elastic young boy voice that can race ahead of its breath while staying intelligible and genuinely likable.
- **Line:** “Called it! This one is going to the MOON!”
- **Read:** Launch immediately, lean hard on “LIFE,” and include one tiny breathless stumble as though the boast arrived faster than his mouth.
- **Avoid:** adult salesman polish, mean swagger, a fake laugh, or winking at the joke.

### 3. Jay Park `smokey`

> Throws harder than anyone. Will not come out.

- **Runtime direction:** glove hero · fierce spirit · quick tempo
- **Priority takes:** `field_ready` · `idle_fidget` · `cheer_fierce` · `upset_fierce`
- **Sculpt:** Treat Zoom as a seated athlete, not a standing model placed in a chair: strong shoulders, active hands, integrated sport-chair geometry and a swept spiky crown should form one fast forward silhouette.
- **Motion:** Drive personality through shoulders, torso and wheel contact. His turns are quick pivots, his pitching coil stores energy across the chair, and his cool reactions finish with an inside-joke glance.
- **Casting:** A relaxed, inventive young boy voice with an easy smile in the tone and enough texture to feel grounded rather than slick.
- **Line:** “You want heat? I brought heat!”
- **Read:** Share a secret on the first sentence, give the second “Nobody” conspiratorial weight, and land the last word with a contained half-laugh.
- **Avoid:** inspirational framing, swagger, pity, breathy cool-guy acting, or added laughter.

## Batch 1

### 4. Sonny Fifita `tank`

> The biggest kid out there. Sorry about that.

- **Runtime direction:** glove hero · tender spirit · calm tempo
- **Priority takes:** `field_ready` · `idle_fidget` · `cheer_tender` · `upset_tender`
- **Sculpt:** Make Big Lou a soft, heavy crescent rather than a square bruiser: round belly, low shoulders, tiny buzzed crown and thick striped shirt, with friendly cheeks carrying more identity than muscle.
- **Motion:** His windups gather slowly and release all at once. Let the head trail the swing, the feet scramble after the follow-through, and the celebration feel delighted by the surprise of his own power.
- **Casting:** A warm, roomy young boy voice with an unhurried rhythm and an effortless playground grin, never a mock “big guy” bass.
- **Line:** “Me? Okay! Sorry, everybody. I am not moving.”
- **Read:** Take a tiny breath before “Moon shot,” then toss “baby” away as a happy phrase he heard somewhere and loves using.
- **Avoid:** a deep adult voice, slow-witted coding, food-character caricature, or forced toughness.

### 5. Dev Raghunathan `wheelchair_ace`

> Throws a pitch nobody can hit. Not even him.

- **Runtime direction:** glove hero · sunny spirit · quick tempo
- **Priority takes:** `field_ready` · `idle_fidget` · `cheer` · `upset`
- **Sculpt:** Keep Tank low, wide and beautifully simple: bald round crown, sleepy compact features, massive tee shape and short planted legs. The readable contrast is power outside, snacky calm inside.
- **Motion:** Tank moves only when needed, then the whole body commits. Anticipations are slow, impacts are enormous, and every settle looks ready to sit down again rather than pose for applause.
- **Casting:** A small, blunt young boy voice with a comfortable low pitch and long pauses, as if every word was selected because extra words cost snack time.
- **Line:** “Yes! Nobody hits my pitch. Nobody.”
- **Read:** Make “Tank smash” an honest little declaration, pause fully, then soften and speed up slightly for “After snacks.”
- **Avoid:** monster growls, caveman parody, an adult bass, shouting, or playing him as unintelligent.

### 6. Zaya Fontaine `rocket`

> The fastest thing in the neighborhood. She knows it.

- **Runtime direction:** glove hero · cool spirit · quick tempo
- **Priority takes:** `field_ready` · `idle_fidget` · `cheer_cool` · `upset_cool`
- **Sculpt:** Give Mimi a spring-loaded silhouette: dense curly halo, proud chin, broad hoodie pocket and strong forearms. She should read like a kid who chose every shape for maximum forward impact.
- **Motion:** She attacks poses with both feet and never performs at half volume. The bat nearly pulls her around, landings rebound once, and the hero beat points her entire torso at the fence.
- **Casting:** A powerful, raspy-edged young girl voice with a fast ignition and real joy underneath the competitive volume.
- **Line:** “Good. Now keep up.”
- **Read:** Explode into “MASH TIME,” take one excited reset, then turn “Point me” into a direct practical instruction.
- **Avoid:** adult rock-singer grit, anger, cheerleader rhythm, or a sustained scream.

### 7. Ezra Bloom `bend_it`

> Six pitches. Not one of them fast.

- **Runtime direction:** swagger hero · cool spirit · calm tempo
- **Priority takes:** `pose_card` · `idle_fidget` · `cheer_cool` · `upset_cool`
- **Sculpt:** Build Turbo from forward diagonals: narrow tee torso, sharp hair, small feet and a slightly nose-first posture. Even in bind pose the silhouette should look one step ahead of its shadow.
- **Motion:** He never quite reaches stillness. Weight changes happen on the balls of the feet, jokes interrupt the pose, and stops use two tiny recovery steps instead of a planted hero landing.
- **Casting:** A quick, light young boy voice with crisp breath control and the delighted rhythm of someone who tells the joke before checking whether anyone followed.
- **Line:** “Good choice. Velocity is overrated.”
- **Read:** Hit “Fast pick” immediately, give the question a genuine hopeful lift, and rush the explanation because he cannot leave the joke alone.
- **Avoid:** chipmunk pitch-shifting, frantic panic, smugness, or synthetic speed-up artifacts.

### 8. Ollie Nowak `turbo`

> Has never been tagged out.

- **Runtime direction:** swagger hero · cool spirit · quick tempo
- **Priority takes:** `pose_card` · `idle_fidget` · `cheer_cool` · `upset_cool`
- **Sculpt:** Protect Sprout’s tiny scale with an oversized curious head, button-bright eyes and a clear overall bib; the silhouette should feel seedling-small but never fragile or babyish.
- **Motion:** His confidence arrives after surprise. Start actions compressed, pop suddenly into full extension, and make the signature fidget a dirt-scrape that becomes an accidental practice bunt stance.
- **Casting:** A high, natural young boy voice with breathy surprise at the edges and a determined centre that appears as the sentence continues.
- **Line:** “Fast pick! Get it? Because I am fast!”
- **Read:** Let “You picked me?” be honestly disbelieving, burst into “YES,” then plant both feet vocally for “Tiny but mighty.”
- **Avoid:** toddler speech, squeaking, helplessness, baby-talk consonants, or inspirational sentiment.

### 9. Fatou Diallo `zippy`

> Undefeated against the ice cream truck.

- **Runtime direction:** batter hero · sunny spirit · quick tempo
- **Priority takes:** `bat_stance` · `idle_fidget` · `cheer` · `upset`
- **Sculpt:** Use Zippy’s pigtails, headband and striped tee as three repeating speed marks, with long light legs and a narrow neck giving the whole model a bouncing roller-skate rhythm.
- **Motion:** She begins moving before the thought finishes. Pigtails should lag directional changes, the hero pose passes through rather than stops, and her win take exits on a playful challenge.
- **Casting:** A bright, athletic young girl voice with clean forward placement, fast rhythm and enough breath to sound like she arrived while running.
- **Line:** “Race you to first! Ready, go!”
- **Read:** Snap the name into place, shorten the pause after “IN,” and throw “Try to keep up” back over the shoulder while already leaving.
- **Avoid:** valley-girl colour, cheerleading cadence, breathless distress, or cartoon squeals.

## Batch 3

### 10. Guri Sandhu `big_lou`

> Tallest boy on the block. Banned from three yards.

- **Runtime direction:** swagger hero · goofy spirit · calm tempo
- **Priority takes:** `pose_card` · `idle_fidget` · `cheer_goofy` · `upset_goofy`
- **Sculpt:** Ace needs balanced, unmistakably competent shapes rather than generic handsomeness: centred cap, clean jacket, even shoulder-to-hip taper and one asymmetrical pocket or brim break for memory.
- **Motion:** He makes hard actions look economical but not effortless. Poses settle square, catches absorb cleanly, and the card beat is a quiet check of glove and field rather than a camera stare.
- **Casting:** A centred young boy voice with calm midrange warmth and no vocal gimmick; credibility should come from ease, not from sounding older.
- **Line:** “Which yard is this? Good. I am allowed in this one!”
- **Read:** Keep “Good call” conversational, pause as if checking the lineup, and state “I do it all” as a useful fact rather than a boast.
- **Avoid:** hero voice, adult coolness, bland commercial polish, smugness, or excessive vocal fry.

### 11. Yaz Rahman `mimi_mash`

> Swings with her eyes closed. Insists it helps.

- **Runtime direction:** batter hero · goofy spirit · steady tempo
- **Priority takes:** `bat_stance` · `idle_fidget` · `cheer_goofy` · `upset_goofy`
- **Sculpt:** Shape Penny around practical pockets and soft symmetry: rounded curls, sturdy overall bib, visible pocket construction and a compact pear silhouette that feels dependable at thumbnail size.
- **Motion:** Her rhythm is steady and prepared. She checks a pocket before the card pose, catches with two hands, and celebrates by sharing the moment outward instead of jumping for attention.
- **Casting:** A warm, even young girl voice with a gentle smile and reassuring cadence, specific enough to be memorable without a novelty trait.
- **Line:** “Eyes closed, bat ready. Trust me!”
- **Read:** Say her own name with pleased certainty, let “Lucky you” sparkle as a friendly tease, and keep the ending small.
- **Avoid:** storybook sweetness, motherly warmth, a breathy whisper, or magical-character affectation.

### 12. Toby Okonkwo `chip`

> Smallest kid. Longest homers. Nobody understands it.

- **Runtime direction:** batter hero · sunny spirit · steady tempo
- **Priority takes:** `bat_stance` · `idle_fidget` · `cheer` · `upset`
- **Sculpt:** Keep Dex visually quiet but authored: dense cap-and-curl silhouette, button eyes, compact hoodie and one strong vertical seam. Nothing should be flashy, and nothing should be default.
- **Motion:** He is the cast’s still point. Idle weight changes are nearly invisible, fielding is square and early, and the hero beat is one glove tap followed by direct eye contact.
- **Casting:** A soft, dry young boy voice with a low-key midrange and deliberate pace; confidence lives in finishing the thought without decoration.
- **Line:** “Little guy, BIG swing. You will see!”
- **Read:** Leave a real pause after “Cool,” then make “Let us win” sound like the next obvious task on a short list.
- **Avoid:** mumbling, sleepy acting, detached sarcasm, adult stoicism, or adding emotional emphasis.

### 13. Roz Achterberg `diva`

> Throws harder than Jay. Never mentions it.

- **Runtime direction:** glove hero · cool spirit · steady tempo
- **Priority takes:** `field_ready` · `idle_fidget` · `cheer_cool` · `upset_cool`
- **Sculpt:** Make Lefty’s long ponytail, narrow shoulders and tilted cap create a curved S-line through the model; jacket seams should echo the bend without turning into a costume motif.
- **Motion:** She thinks in arcs. The pitching coil travels around the spine, glove and ponytail finish on delayed curves, and even a shrug traces a clean controlled loop.
- **Casting:** A focused young girl voice with a slightly husky middle, precise timing and a private sense of humour that never breaks concentration.
- **Line:** “Sure. I can pitch.”
- **Read:** Place a tiny curve in the melody of “curveball,” then offer “thank you” with mock formality and a restrained smile.
- **Avoid:** sports-anime intensity, mystical fortune-teller colour, adult sarcasm, or a broad punchline.

### 14. Kwame Boateng `boomer`

> Pure gas. No idea where it goes. Sorry.

- **Runtime direction:** bashful hero · tender spirit · steady tempo
- **Priority takes:** `nervous` · `idle_fidget` · `cheer_tender` · `upset_tender`
- **Sculpt:** Smokey should be a compact hot coal: close buzz cut, narrowed face, thick tee chest and minimal loose detail, with the darkest values concentrated around eyes and shoulders.
- **Motion:** All energy stays contained until release. Windup tension compresses into the planted leg, the arm snaps through, and reactions end in a hard exhale rather than extra posing.
- **Casting:** A tight, energetic young boy voice with a little natural rasp and short phrasing, intense without sounding angry or older.
- **Line:** “I will throw hard! Sorry in advance!”
- **Read:** Challenge on “You want heat?” without shouting, then answer himself immediately with a clipped, satisfied second sentence.
- **Avoid:** villain menace, macho gravel, yelling, fire sound effects, or exaggerated toughness.

### 15. Greta Lindqvist `grizz`

> Built like a door. Has never dropped anything.

- **Runtime direction:** glove hero · fierce spirit · calm tempo
- **Priority takes:** `field_ready` · `idle_fidget` · `cheer_fierce` · `upset_fierce`
- **Sculpt:** Let Bendy’s bun, round glasses and striped shirt form stacked circles interrupted by a narrow crooked torso; the model should look curious from every angle, never merely nerd-coded.
- **Motion:** His body follows the path he imagines for the ball. Gestures draw curves in space, balances recover through unexpected side steps, and the goofy win is discovery rather than slapstick.
- **Casting:** A curious young boy voice with flexible pitch, careful words and sudden delighted acceleration when an idea becomes visible.
- **Line:** “Good. Nothing gets past me. Nothing.”
- **Read:** Stretch “Yesss” because the experiment worked, physically trace the word “around,” and finish in wonder instead of triumph.
- **Avoid:** nasal nerd stereotype, foreign accent coding, manic scientist acting, or random vocal wobble.

## Batch 4

### 16. Musa Farah `gizmo`

> Learned it off a video. Works 40% of the time.

- **Runtime direction:** bashful hero · sunny spirit · steady tempo
- **Priority takes:** `nervous` · `idle_fidget` · `cheer` · `upset`
- **Sculpt:** Noodle is long where Sprout is small: narrow shoulders, lifted neck, oversized glasses and loose striped sleeves should create a lovable vertical wobble without making him look breakable.
- **Motion:** Effort is visible before outcome. He rehearses the pose, checks whether it worked, then commits too hard; recoveries are earnest and carefully rebuilt rather than broad pratfalls.
- **Casting:** A light, sincere young boy voice with open vowels, quick nervous breaths and a surprising streak of resolve when given a job.
- **Line:** “I watched the video twice. I am ready!”
- **Read:** Let both questions be genuinely stunned, take a breath after “REALLY,” and drive “SO hard” from determination rather than desperation.
- **Avoid:** whining, weakness as a joke, stammer caricature, baby voice, or pity-seeking sentiment.

### 17. Hattie Bloom `peaches`

> Same soft single. Same spot. Every time.

- **Runtime direction:** batter hero · tender spirit · steady tempo
- **Priority takes:** `bat_stance` · `idle_fidget` · `cheer_tender` · `upset_tender`
- **Sculpt:** Make Bubbles a cluster of soft buoyant shapes: cloud curls, round cheeks, flared dress and small hands, with two or three deliberate asymmetries keeping the silhouette handmade.
- **Motion:** She rebounds from every contact as if the ground is friendly. Holds are short, turns float through the shoulders, and celebration energy keeps finding one more person to include.
- **Casting:** A sunny young girl voice with rounded vowels, natural giggle energy held inside the words, and enough grounding to avoid a toy-commercial sound.
- **Line:** “Single to left. You know it. I know it.”
- **Read:** Open with an unforced “Yay,” discover the superlative in real time, and let “EVER” bloom without adding a laugh.
- **Avoid:** squealing, fairy voice, relentless high pitch, commercial cuteness, or audible giggle buttons.

### 18. Anton Reyes `sniffles`

> Junebug's best friend. Also never strikes out.

- **Runtime direction:** batter hero · sunny spirit · quick tempo
- **Priority takes:** `bat_stance` · `idle_fidget` · `cheer` · `upset`
- **Sculpt:** Build Sniffles from tucked shapes: slightly raised shoulders, small hoodie opening, soft under-eye forms and one practical handkerchief pocket, while keeping the face lively rather than sickly.
- **Motion:** He braces for sneezes that may not arrive. The signature fidget is a nose scrunch and aborted reach for the pocket; athletic actions briefly forget the allergy entirely.
- **Casting:** A gentle young boy voice with a naturally stuffy edge used sparingly, clear speech underneath and a hopeful lift after embarrassment.
- **Line:** “Junebug and me practice EVERY day!”
- **Read:** Celebrate first, let the sneeze interrupt rather than become a sound-effect routine, then rebuild “yay” with sheepish sincerity.
- **Avoid:** constant congestion, gross-out comedy, frailty, fake sneezing fits, or a nasal stereotype.

### 19. Winnie Okafor `cricket`

> Has never swung the bat. It is a philosophy.

- **Runtime direction:** batter hero · cool spirit · calm tempo
- **Priority takes:** `bat_stance` · `idle_fidget` · `cheer_cool` · `upset_cool`
- **Sculpt:** The Professor needs precise construction, not generic glasses: squared jacket pockets, measured hair part, slightly long face and clean tool-like angles balanced by unmistakably child-sized hands.
- **Motion:** He observes before acting and annotates the result afterward. The card pose includes one invisible calculation, while successful contact causes a rare uncontrolled flash of delight.
- **Casting:** A crisp young boy voice with deliberate diction and a quiet upward curiosity, intelligent without imitating an adult lecturer.
- **Line:** “I will not swing. That is the plan.”
- **Read:** Treat “Statistically” as familiar playground vocabulary, pause to verify the conclusion, then warm “excellent decision” by one degree.
- **Avoid:** professor parody, British affectation, robotic precision, condescension, or precocious-adult cadence.

### 20. Rafi Costa `sprout`

> Bunts every single pitch. He has been begged.

- **Runtime direction:** batter hero · goofy spirit · quick tempo
- **Priority takes:** `bat_stance` · `idle_fidget` · `cheer_goofy` · `upset_goofy`
- **Sculpt:** Dazzle’s long hair, headband and dress should form one dramatic curtain around a sharp confident face; reserve the brightest accent for a small star-like detail, not all-over sparkle.
- **Motion:** She always knows where the camera would be. Turns finish on a clean three-quarter, the kiss is tossed after the baseball action is complete, and a missed beat protects dignity before revealing hurt.
- **Casting:** A poised young girl voice with musical phrasing, playful certainty and enough ordinary playground texture to keep glamour self-invented.
- **Line:** “Bunt! Bunt! You cannot stop me!”
- **Read:** Make “Obviously” affectionate rather than dismissive, take ownership of the pause, and place a quick real kiss on “Mwah.”
- **Avoid:** adult diva impersonation, breathy seduction, mean-girl coding, pageant polish, or excessive sparkle sounds.

### 21. Josie Kingbird `clover`

> Fouls them back at the pitcher. By accident.

- **Runtime direction:** bashful hero · goofy spirit · quick tempo
- **Priority takes:** `nervous` · `idle_fidget` · `cheer_goofy` · `upset_goofy`
- **Sculpt:** Grizz is a sleepy storm cloud: wide afro mass, heavy brow, rounded tee body and low-set hands. Preserve a soft cheek line so the grumpiness reads as mood, never threat.
- **Motion:** Gravity wins until baseball interrupts it. His idle nearly naps, power wakes through one enormous uncoiling action, and the upset take is mostly the inconvenience of having to react.
- **Casting:** A low, fuzzy young boy voice with slow onset, dry warmth and the sound of someone who was comfortable two seconds ago.
- **Line:** “Oops! Did I hit that at you? Oops!”
- **Read:** Use “Fine” to finish an argument nobody heard, make the nap complaint honest, then find a small competitive spark in “play.”
- **Avoid:** bear growls, adult bass, hostility, lazy-child judgement, or monotone mumbling.

## Batch 5

### 22. Sam Whitehorse `noodle`

> Gets hit by the pitch on purpose. Calls it strategy.

- **Runtime direction:** bashful hero · cool spirit · steady tempo
- **Priority takes:** `nervous` · `idle_fidget` · `cheer_cool` · `upset_cool`
- **Sculpt:** Make Flash a bolt made from elbows, mohawk and striped torso: lean limbs, sharp crown and a bat-side shoulder slightly ahead, while keeping the facial planes friendly and young.
- **Motion:** His hands are faster than the rest of him and he enjoys proving it. Bat actions snap around a clear hold, while locomotion stays smooth enough that speed reads as control.
- **Casting:** A taut, bright young boy voice with quick clean attacks and competitive energy, more sprinter than superhero.
- **Line:** “Great. Hit me. I mean the pitcher. Hit me.”
- **Read:** Fire “Fastest bat” as a practiced title, then make “reporting in” a playful formal arrival with no extra flourish.
- **Avoid:** comic-book hero voice, speed-up processing, cockiness, shouting, or military parody.

### 23. Nora Begović `penny`

> Utterly ordinary. Until you are behind.

- **Runtime direction:** glove hero · cool spirit · calm tempo
- **Priority takes:** `field_ready` · `idle_fidget` · `cheer_cool` · `upset_cool`
- **Sculpt:** Cricket should look assembled from springs: spiky crown, small overall bib, long elastic limbs and offset button details. Keep the asymmetry controlled so she remains readable, not chaotic.
- **Motion:** She stores energy in every crouch and releases it vertically. The signature fidget is one contained bounce that accidentally becomes three, followed by a proud attempt at stillness.
- **Casting:** A buoyant young girl voice with percussive consonants, quick pitch hops and a strong natural centre beneath the play.
- **Line:** “Fine. Call me when we are losing.”
- **Read:** Make each “Boing” a different discovered bounce, keep “Picked” intelligible in the middle, and stop cleanly after the final one.
- **Avoid:** rubber sound effects, chipmunk processing, uncontrolled squeals, or randomness without intention.

### 24. Marcus Webb `dex`

> Can't hit in practice. Can't miss in a game.

- **Runtime direction:** batter hero · cool spirit · steady tempo
- **Priority takes:** `bat_stance` · `idle_fidget` · `cheer_cool` · `upset_cool`
- **Sculpt:** Moose needs a protective, open silhouette: broad hoodie, big cap, soft cheeks and long embracing arms. Avoid narrowing the waist so his size reads as warmth before strength.
- **Motion:** He moves toward teammates, not the camera. Throws use his whole frame gently, victories open into a group hug, and even frustration turns into checking whether someone else is okay.
- **Casting:** A large, warm young boy voice with open resonance, easy laughter inside the breath and no pressure to sound tough.
- **Line:** “Cool. Is this a real game? Then I am good.”
- **Read:** Start with spontaneous delight, build “Team hug” into an invitation, and let “everybody” widen as if locating the whole bench.
- **Avoid:** oaf coding, adult baritone, booming volume, forced cuddliness, or slow speech as stupidity.

### 25. Yui Tanaka `bubbles`

> Only good with runners on. Nobody knows why.

- **Runtime direction:** bashful hero · sunny spirit · quick tempo
- **Priority takes:** `nervous` · `idle_fidget` · `cheer` · `upset`
- **Sculpt:** Peaches should read as sun-warmed rather than sugary: neat bun, freckled button face, simple dress flare and one leaf-like seam, with a balanced batter-ready stance under the softness.
- **Motion:** Her timing is smooth and generous. The swing begins with a quiet breath, follow-through opens toward the team, and the hero pose lets the smile arrive after the body settles.
- **Casting:** A warm young girl voice with clear midrange, an easy smile and a gentle Southern sunlight quality without using a regional accent.
- **Line:** “Me? Okay! Just put someone on base first.”
- **Read:** Let the first “Sweet” be a real response, enjoy the repeated word, and promise the swing with relaxed certainty rather than salesmanship.
- **Avoid:** syrupy sweetness, Southern caricature, princess tone, whispering, or commercial warmth.

### 26. Lu Fernández `lefty`

> One perfect curve. It is all she throws.

- **Runtime direction:** glove hero · fierce spirit · steady tempo
- **Priority takes:** `field_ready` · `idle_fidget` · `cheer_fierce` · `upset_fierce`
- **Sculpt:** Gizmo’s glasses, spiky hair and overall hardware should look purpose-built: visible fasteners, one modified pocket and a bat-grip detail, but never so many gadgets that the child disappears.
- **Motion:** He tests mechanisms even while waiting. The fidget checks the bat, the hero pose presents one improvement, and surprise at a great hit is immediately followed by analysing why.
- **Casting:** A focused young boy voice with quick technical enthusiasm, compact phrasing and a tactile delight in naming something he made.
- **Line:** “My curveball says thank you!”
- **Read:** Treat “Great” as confirmation, point vocally to the bat, pause, then make “I built it” the proud emotional centre.
- **Avoid:** robot voice, mad-scientist energy, nasal nerd coding, jargon additions, or gadget sound effects.

### 27. Bao Nguyen `the_prof`

> His pitch loops so high it counts as weather.

- **Runtime direction:** glove hero · goofy spirit · steady tempo
- **Priority takes:** `field_ready` · `idle_fidget` · `cheer_goofy` · `upset_goofy`
- **Sculpt:** Clover’s pigtails and dress should create a four-leaf rhythm only on second glance: four soft outward lobes, tiny freckles and one off-centre seam keep luck embedded rather than costumed.
- **Motion:** Good outcomes seem to happen around her before she notices. She dodges by accident, catches on a late soft reach, and celebrates with amused gratitude rather than claiming control.
- **Casting:** A light, natural young girl voice with a curious upward lilt and playful timing, lucky because she is open rather than mystical.
- **Line:** “The Rainbow is ready! Look UP!”
- **Read:** Tease gently on “Lucky you,” correct herself with real urgency, and make the last “luck” sound like evidence she just remembered.
- **Avoid:** leprechaun colour, magical whispering, manic perkiness, Irish accent coding, or smug certainty.

## Batch 6

### 28. Rudy Achterberg `flash`

> Roz's little sister. Throws runners out from the fence.

- **Runtime direction:** glove hero · fierce spirit · quick tempo
- **Priority takes:** `field_ready` · `idle_fidget` · `cheer_fierce` · `upset_fierce`
- **Sculpt:** Rocket Rosa is a clean launch shape: swept ponytail, narrow tee torso, long forward legs and a small nose-up chin. Echo a rocket only through silhouette, never literal fins or flames.
- **Motion:** Every start has a visible countdown in the knees and one decisive release. Her ponytail marks acceleration, turns bank cleanly, and stops finish in a compact ready stance.
- **Casting:** A cool, athletic young girl voice with firm breath support, concise phrasing and a bright lift that appears only at launch.
- **Line:** “Do not run on me. My sister taught me.”
- **Read:** State her name like a systems check, hold the comma-sized beat, then let “liftoff” rise cleanly without becoming a shout.
- **Avoid:** astronaut radio effects, superhero tone, adult coolness, engine noises, or excessive breathiness.

### 29. Amir Haddad `ace_kid`

> Plays center field alone. Does not need help.

- **Runtime direction:** swagger hero · cool spirit · steady tempo
- **Priority takes:** `pose_card` · `idle_fidget` · `cheer_cool` · `upset_cool`
- **Sculpt:** Chip needs a compact squirrel-fast silhouette without becoming an animal mascot: small hoodie, quick feet, three loose cap wisps and full cheeks, with the bat deliberately a little undersized.
- **Motion:** He makes many tiny adjustments and one clean decision. Feet patter under an otherwise calm glove, the card pose arrives in two hops, and the win ends by making room for the next play.
- **Casting:** A small, bright young boy voice with nimble consonants, friendly urgency and enough calm to keep speed from becoming nervousness.
- **Line:** “Good call. I have got the whole outfield.”
- **Read:** Announce his own name with happy surprise, accelerate through “Quick feet,” and use “coming through” as a polite moving warning.
- **Avoid:** squirrel noises, chipmunk pitch, baby voice, frantic breathlessness, or cartoon-animal coding.

### 30. Roya Nazarian `moose`

> Incredible arm. Catastrophic judgment.

- **Runtime direction:** swagger hero · sunny spirit · quick tempo
- **Priority takes:** `pose_card` · `idle_fidget` · `cheer` · `upset`
- **Sculpt:** Boomer is a loud graphic exclamation: tall mohawk, wide mouth, heavy striped chest and planted legs. Keep the eyes warm and the outline clean so volume reads as generosity, not aggression.
- **Motion:** He broadcasts through the whole skeleton. Even a whisper uses giant mime, celebrations hit four clear beats, and the settle includes a sheepish check that everyone survived the volume.
- **Casting:** A resonant young boy voice with excellent projection and rhythmic control; loudness must sound joyful and safe, never strained.
- **Line:** “Watch THIS throw! Which base? Does not matter!”
- **Read:** Give each written word its own stadium beat, build through the second “IS,” and finish “TEAM” cleanly without clipping or extra yelling.
- **Avoid:** microphone distortion, adult stadium announcer voice, anger, throat strain, or a single undifferentiated scream.

## Acceptance

1. Technical model, animation and voice-master validators pass.
2. The kid is identifiable without their name card in a same-team-colour contact sheet.
3. A/B review shows the character-specific takes with ★ on `/v2/?anims=1&kid=<id>` and shared fallbacks with ▪.
4. A blind listener can distinguish the line from the two adjacent roster entries and describe the intended attitude without seeing the card.
5. The maintainer records performer/model/animation provenance before shipping; generated and system stand-ins are not final delivery.
