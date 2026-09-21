# Theo hand and arm reference — September 20, 2026

This is a reference-hand iteration on Theo (`calls_shot`). It is not a roster
rollout or whole-game art approval. The other 29 characters retain their
existing hands in this revision.

The rejected draft screenshots showed a sleeve across Theo's face, folded
arms crowding the torso, and hands whose fingers moved as one rigid piece.
The reference source now has separate finger roots, a second curl hinge,
an opposing thumb, and outward-facing finger caps. Forty-one delivered bones
remain under the unchanged limit of 42. The existing LOD triangle budgets
remain unchanged.

The runtime separates elbow flexion from forearm roll, limits non-batting wrist bending,
and blends hand shapes when actions change. The bat crosses the palm and sits
against its surface. Both hand anchors remain on the handle throughout the
batting solve. The jacket and inner shirt share spine-weight falloff, and the
inner layer has clearance during torso twists.

## Evidence

- [Palm, back and oblique hand close-ups](../concepts/theo-hand-reference.png):
  relaxed, pointing, and isolated grip studies. The grip study resets the body
  to expose the hand; it is not a full batting-pose certificate.
- [Actual narrow-window draft](../concepts/theo-draft-reference.png).
- [Recorded transition sequence](../concepts/theo-hand-transitions.mp4):
  296 frames at 20 fps, captured by advancing the production animation director.
  Includes draft gestures, batting, running, and throwing.
- [Current whole-character fidelity board](../concepts/theo-fidelity-review.png)
  and the linked runtime stills in the character-fidelity record.

The independent critic reviewed palm/back/side studies, two-hand batting
close-ups, three poses from each of 43 actions, and 45 selected frames around
15 transition boundaries. That review missed folded batting wrists: the user subsequently identified
a right wrist bent back about 144 degrees in the ready stance. Its prior
scoped acceptance did not establish a correct batting grip. It did not certify every frame of every
animation. Some jump/dive extremities were still cropped in the review sheets.

## Technical checks

The delivered-model tests require finger volume, blended roots, outward cap
winding, proper distal-joint parents, and the actual 42-bone limit. Runtime
tests cover pointing, distal curl, hand blending, restoration after seeking,
forward elbow flexion, handle orientation, and two-hand anchor contact.

The subsequent batting correction solves handle roll and elbow swivel together,
moves pronation into the forearm, and holds the upper sleeve upright without
angle-wrap jumps. The ready bat is more upright, and recovery retains enough
upward tilt to avoid folding the support wrist. Both hands remain attached.
This path is enabled for the complete reference hand chain, currently Theo.

[Three-angle batting comparison](../concepts/theo-batting-wrists.png) shows ready,
contact and follow-through after correction. The previous ready pose measured
144 degrees of right-wrist bend; the corrected ready pose measures about
2 degrees on the right and 2.5 on the left. The mirrored gameplay audit samples
reference hands at 120 Hz and rejects wrist bends over 40 degrees, wrist twist
over 25 degrees, or arm rotation steps over 25 degrees per sample. It also
retains the original anchor, contact, head-facing and shaft intersection checks.
The unit regression was verified to reject the previous solver. An independent
critic reviewed the corrected ready/contact/follow views and recovery frames
12–14 from three angles, clearing the folded-wrist and new shoulder-collapse
findings. Existing blocky sleeve construction remains separate polish debt.

The corrected audit sampled 5,544 poses across all 30 delivered characters,
including 672 reference-hand samples: no failures or shaft-centreline
intersections. Maximum reference wrist bend was 33.53 degrees. These are
mechanical diagnostics, not barrel-radius clearance or finger-surface contact
certificates. The production build and 2,358 tests (12 existing skips) passed.
The prior 62-model validation and full-game check remain applicable to the
unchanged asset delivery; no models or animation takes changed in this fix.

## Dedicated bunt pose

The user subsequently identified that the bunt was still a normal stacked grip
pushed forward. Theo now turns toward the pitcher, pivots the planted feet,
bends the knees, and presents a slightly raised barrel across the chest. The
bottom hand stays near the knob while the top hand slides up the taper and
changes to a thumb/index cradle. Preparation and recovery carry the bat around
the face; the receiving phase holds it quiet instead of stabbing forward.
The pose follows the split-grip and athletic-stance cues in this
[Little League bunting drill](https://www.sclittleleague.com/Default.aspx?ctl=newsdetail&mid=1820486&newsid=212691&newskeyid=HN1&tabid=1759115).

[Full-body bunt views](../concepts/theo-bunt-reference.png) and the
[preparation/hold/recovery recording](../concepts/theo-bunt-motion.mp4) show the
reference correction. The pose was also inspected in the actual gameplay
camera; the review capture substitutes Theo for the batter without changing
the underlying matchup HUD. The independent critic found that the split grip,
raised barrel and knee flexion now read as a bunt, and reviewed all 62 frames
of the final two-cycle recording without a remaining scoped visual blocker.
The recorder repaints the same posed instant after adaptive viewport resizing;
it does not advance animation to replace a blank capture. Live and seek
transforms were compared at the held pose and agree. This remains a Theo-only
reference correction; legacy-hand characters retain their existing bunt.

The regression rejects the previous pose's closely stacked hands and checks
hand separation, contact with the taper, chest direction, knee bend, bat angle,
and recovery to the ordinary stance. The existing 120 Hz wrist/roll checks
remain unchanged. The shaft audit now distinguishes deliberate top-hand
contact from collisions: only nearby triangles weighted to that hand are
exempt; head, torso and sleeve hits still fail. It caught a head intersection
in an intermediate transition, which was corrected before delivery.

## Upset gesture clearance

The user found Theo's arms passing through his body in `upset_goofy`. The
gesture added shoulder rotation to an already lowered idle pose, bringing
the upper arms across the jacket. Both the disbelief and slump now use
absolute arm poses with outward elbows and forward forearm flexion. The
head shake and body lean remain. Theo's delivered performance take was
rebaked so the correction reaches the production animation director.

[Three-angle upset views](../concepts/theo-upset-reference.png) and the
[two-cycle recording](../concepts/theo-upset-motion.mp4) cover the gesture
and its transitions back to idle. The regression samples the whole clip at
120 Hz and checks that both elbows stay outside their shoulder positions in
chest space. It failed against the previous take's source before the fix.
This bone-clearance check supplements visual review; it cannot establish
clothing-surface clearance by itself.

An independent critic reviewed the three-angle samples and all 86 captured
frames at 20 fps. No torso penetration, detached shoulder, folded wrist or
transition discontinuity remained in that evidence. The character retains
its existing overall fidelity scores and `needs-polish` status.

## Still unfinished

Theo remains `needs-polish` in the independent fidelity record. Three shoe
metrics remain outside tolerance; cap shape, hair, ear visibility and tailoring
also retain findings. The current scoop/low-catch and chest-catch poses do not
communicate catching well, and the slide reads as an upright lean. These are
separate animation-authoring issues, not evidence that the hand rig is finished
across the roster.

The user also identified the short, low throwing motion. Review confirmed
insufficient overhand preparation and extension, compressed release motion,
and a gameplay cue that starts at release. Throwing remains unfinished.

Use the reference to fit the broad-bodied and seated cases next, with their
own proportions, sources, gestures and fresh review. A successful export or a
passing position test must never substitute for that review.
