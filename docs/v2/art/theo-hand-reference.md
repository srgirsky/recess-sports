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

The runtime separates elbow flexion from forearm roll, limits wrist bending,
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
15 transition boundaries. The scoped hand/arm review found no remaining clear
anatomical blocker in those samples. It did not certify every frame of every
animation. Some jump/dive extremities were still cropped in the review sheets.

## Technical checks

The delivered-model tests require finger volume, blended roots, outward cap
winding, proper distal-joint parents, and the actual 42-bone limit. Runtime
tests cover pointing, distal curl, hand blending, restoration after seeking,
forward elbow flexion, handle orientation, and two-hand anchor contact.

The final batting audit sampled 5,040 poses across all 30 delivered characters:
no mechanical failures or shaft-centreline intersections. That diagnostic does
not prove barrel-radius clearance or visually correct finger enclosure. The
62-model validator, production build, 2,356 tests (12 existing skips), and
full-game presentation check passed.

## Still unfinished

Theo remains `needs-polish` in the independent fidelity record. Three shoe
metrics remain outside tolerance; cap shape, hair, ear visibility and tailoring
also retain findings. The current scoop/low-catch and chest-catch poses do not
communicate catching well, and the slide reads as an upright lean. These are
separate animation-authoring issues, not evidence that the hand rig is finished
across the roster.

Use the reference to fit the broad-bodied and seated cases next, with their
own proportions, sources, gestures and fresh review. A successful export or a
passing position test must never substitute for that review.
