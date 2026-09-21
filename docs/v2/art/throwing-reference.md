# Fielding throw correction — September 21, 2026

The original fielding throw rotated the upper arm around its length, leaving
the elbow low. Its release occupied two frames, and gameplay started at the
release marker, hiding preparation. The shared overhand clip now raises the
elbow, cocks the hand beside the head, extends toward the receiver, and gives
the arm time to follow through and recover. The quick clip uses the same arm
mechanics over its shorter duration, with an explicit release marker. Clip
durations and markers are defined in the animation brief and contract.

The live view uses the existing ball-transfer clock. It shows the catch first,
then prepares the throw while the ball is still held. The CPU's throw choice
is exposed as a read-only query used by both the reducer and presentation;
human throws still enter the reducer's original release path. If no useful
throw is predicted, the character holds a cocked pose rather than releasing
an imaginary ball. Only the actual throw or relay event resumes release and
follow-through. A cancelled preparation returns to field-ready when possession
or the live play ends.

The carrier faces the intended receiver and keeps that direction through the
follow-through. The displayed ball follows the throwing palm during preparation.
Because displayed characters are larger than their physical sim dimensions,
the renderer eases the release-position offset out over the first quarter of
flight; simulated flight, arrival, outs and runner races are unchanged. Replay
records the displayed positions. A late human target change can still require
an immediate release pose: the view does not delay a simulation event to finish
an animation.

The shared library and Zoom's seated library were rebaked. No character mesh
was changed. Pitch delivery is a separate clip family and is outside this pass.

Verification includes semantic elbow/hand positions, straightened release,
follow-through, marker derivation, paused preparation, cancellation, a real
simulated transfer/release, and read-only prediction. The existing ground,
rig, asset, timing and sim tests remain in force. Visual evidence includes
both throws on all 30 delivered characters and continuous playback, rather
than treating a marker or unit-test pass as visual approval.

- [Overhand and quick motion](../concepts/throwing-motion.mp4)
- [Throwing-side view](../concepts/throwing-arm-side.mp4)
- [Live fielding throw](../concepts/throwing-live.mp4): Lefty's actual possession,
  release and follow-through, with the camera moved closer for inspection.
  All 23 sampled preparation ticks kept the displayed ball on the palm; the
  release tick also starts there. The sim state is unchanged by the renderer.

An independent critic reviewed the 30 roster strips, 232 continuous-motion
frames across Theo's three camera angles and Zoom's throwing side, and all
40 live-game frames. The scoped review found no definite body/head
penetration, reversed elbows, collapsed wrists or torn sleeves. Raised-elbow
preparation, forward extension and recovery read clearly. Zoom's overall
fidelity scores and 21 unrelated findings remain unchanged; this is not
whole-character approval.
