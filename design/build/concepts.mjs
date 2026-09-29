/*
 * SynAmp logo concepts — single source of truth.
 *
 * Colours come straight from apps/web/src/styles/tokens.css (LCD amber #e0a33e,
 * near-black #0e0e10). Every mark is authored on a 48x48 grid with monoline
 * strokes so it stays crisp from 16px favicon to signage.
 *
 * Each concept exposes a `mark(c, uid)` that returns inline SVG markup.
 * `c` = { ink, accent, muted }; `uid` keeps clipPath ids unique per instance.
 */

export const TOKENS = {
  bg: "#0e0e10",
  surface: "#16161a",
  text: "#ececec",
  muted: "#8a8a94",
  accent: "#e0a33e",
  hair: "rgba(255,255,255,0.08)",
};

const LIGHT = { ink: "#111114", accent: "#e0a33e", muted: "#70707a", bg: "#ffffff" };
const DARK = { ink: "#ececec", accent: "#e0a33e", muted: "#8a8a94", bg: "#0e0e10" };

export const colors = (theme) => (theme === "light" ? LIGHT : DARK);

const S = (d, { stroke = "currentColor", width = 2.2, extra = "" } = {}) =>
  `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;

/*
 * Brain (concepts 11–14). Top-down, two hemispheres that overlap at the
 * longitudinal fissure — the overlap *is* the Venn lens, filled amber. The
 * lobes peak at x≈17 / x≈31 and dip to (24,12)/(24,36), so the union reads as a
 * brain with a central cleft rather than two plain ovals.
 */
const BRAIN_L =
  "M24 12 C16 8 6 10 4 18 C2 27 5 36 12 39 C17 41 21 39 24 36 C30 30 30 18 24 12 Z";
const BRAIN_R =
  "M24 12 C32 8 42 10 44 18 C46 27 43 36 36 39 C31 41 27 39 24 36 C18 30 18 18 24 12 Z";
const GYRI = [
  "M8.5 18.5 C12 16.5 15 18 15.5 21",
  "M7.5 27 C11 25 14.5 26.5 15 29.5",
  "M39.5 18.5 C36 16.5 33 18 32.5 21",
  "M40.5 27 C37 25 33.5 26.5 33 29.5",
];

function brain(c, uid, { motif = "", folds = true } = {}) {
  const gyri = folds
    ? GYRI.map(
        (d) =>
          `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.9"/>`
      ).join("")
    : "";
  return (
    `<defs><clipPath id="brain-${uid}"><path d="${BRAIN_R}"/></clipPath></defs>` +
    `<g clip-path="url(#brain-${uid})"><path d="${BRAIN_L}" fill="${c.accent}"/></g>` +
    `<path d="${BRAIN_L}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>` +
    `<path d="${BRAIN_R}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>` +
    gyri +
    motif
  );
}

/* Motifs that sit in the amber seam, punched in the background colour. */
const seamEq = (c) =>
  `<g stroke="${c.bg}" stroke-width="2.2" stroke-linecap="round">` +
  `<line x1="20.8" y1="20" x2="20.8" y2="28"/>` +
  `<line x1="24" y1="15" x2="24" y2="33"/>` +
  `<line x1="27.2" y1="19" x2="27.2" y2="29"/>` +
  `</g>`;

const seamNote = (c) =>
  `<circle cx="21.6" cy="29" r="2.6" fill="${c.bg}"/>` +
  `<path d="M24.2 29 V17.5 M24.2 17.5 C27 18.5 28 20.3 26.8 23" fill="none" stroke="${c.bg}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`;

/* Left hemisphere speaks, right hemisphere plays. */
const duet = () =>
  `<circle cx="10.5" cy="24" r="1.4" fill="currentColor"/>` +
  `<circle cx="14" cy="24" r="1.4" fill="currentColor"/>` +
  `<circle cx="17.5" cy="24" r="1.4" fill="currentColor"/>` +
  `<circle cx="33.5" cy="27" r="2.2" fill="currentColor"/>` +
  `<path d="M35.4 27 V18 M35.4 18 C38 18.8 38.8 20.4 37.6 22.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;

/*
 * Marks. `ink` is applied by the wrapper via `color:`, so strokes use
 * currentColor and only the accent is painted with an explicit fill.
 */
export const CONCEPTS = [
  {
    id: "synapse-node",
    n: 1,
    name: "Synapse Node",
    wordmark: "display",
    blurb:
      "Two neurons joined by a travelling signal. The literal reading of the name: a connection firing between a prompt and a track.",
    mark: (c) =>
      `${S("M13 24 Q19 13 24 24 T35 24")}` +
      `<circle cx="11" cy="24" r="3.6" fill="${c.accent}"/>` +
      `<circle cx="37" cy="24" r="3.6" fill="none" stroke="currentColor" stroke-width="2.2"/>`,
  },
  {
    id: "amp-pulse",
    n: 2,
    name: "Amp Pulse",
    wordmark: "display",
    blurb:
      "An amplifier play-head with a waveform cutting straight through it. Signal in, signal out — language becomes sound.",
    mark: (c) =>
      `<path d="M15 11 L37 24 L15 37 Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>` +
      `${S("M6 24 h5 l2.5-7 3.5 14 3-9 2 2 h11", { stroke: c.accent })}`,
  },
  {
    id: "neuron-eq",
    n: 3,
    name: "Neuron EQ",
    wordmark: "mono",
    blurb:
      "Equaliser bars read as dendrites; a synapse line links their tips. The most literal nod to Winamp's spectrum analyser.",
    mark: (c) => {
      const xs = [12, 18, 24, 30, 36];
      const top = [20, 12, 16, 8, 22];
      let out = "";
      xs.forEach((x, i) => {
        const hot = i === 3;
        out += `<line x1="${x}" y1="36" x2="${x}" y2="${top[i]}" stroke="${hot ? c.accent : "currentColor"}" stroke-width="2.6" stroke-linecap="round"/>`;
      });
      out += `${S("M12 20 L18 12 L24 16 L30 8 L36 22", { stroke: c.accent, width: 1.5, extra: 'opacity="0.9"' })}`;
      xs.forEach((x, i) => {
        out += `<circle cx="${x}" cy="${top[i]}" r="2.1" fill="${i === 3 ? c.accent : "currentColor"}"/>`;
      });
      return out;
    },
  },
  {
    id: "connectome",
    n: 4,
    name: "Connectome",
    wordmark: "display",
    blurb:
      "A constellation of tracks with one route lit amber — the playlist your prompt carved through the library.",
    mark: (c) => {
      const A = [11, 33],
        B = [20, 11],
        C = [37, 30],
        D = [41, 12],
        E = [26, 22];
      const line = (p, q, col, w) =>
        `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
      let out = "";
      out += line(A, E, "currentColor", 1.5);
      out += line(E, C, "currentColor", 1.5);
      out += line(C, D, "currentColor", 1.5);
      out += line(B, E, c.accent, 2);
      out += line(E, D, c.accent, 2);
      const dot = (p, col, r) => `<circle cx="${p[0]}" cy="${p[1]}" r="${r}" fill="${col}"/>`;
      out += dot(A, "currentColor", 2.4) + dot(C, "currentColor", 2.4);
      out += dot(B, c.accent, 2.8) + dot(D, c.accent, 2.8);
      out += `<circle cx="${E[0]}" cy="${E[1]}" r="3.4" fill="${c.accent}"/>`;
      return out;
    },
  },
  {
    id: "spark",
    n: 5,
    name: "Spark",
    wordmark: "display",
    blurb:
      "A gap between two terminals with the charge jumping across. High-energy, built for DJ mode and instant playlists.",
    mark: (c) =>
      `<line x1="12" y1="13" x2="12" y2="35" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>` +
      `<line x1="36" y1="13" x2="36" y2="35" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>` +
      `<path d="M27.5 8.5 L17.5 25 h5.8 L18.5 39.5 l11.2-17.2 h-6 z" fill="${c.accent}" stroke="${c.accent}" stroke-width="1.4" stroke-linejoin="round"/>`,
  },
  {
    id: "sine-s",
    n: 6,
    name: "Sine S",
    wordmark: "display",
    blurb:
      "The initial itself is a waveform — one continuous sine that happens to spell S. The most distilled monogram of the set.",
    mark: (c) =>
      `${S("M33 13 C25 6 14 10 14 18 C14 26 34 23 34 31 C34 39 24 43 15 36", { width: 2.6 })}` +
      `<circle cx="33" cy="13" r="2.6" fill="${c.accent}"/>`,
  },
  {
    id: "cortex-rings",
    n: 7,
    name: "Cortex Rings",
    wordmark: "mono",
    blurb:
      "Ripples leaving a single origin point — equally a speaker cone waking up and a cortex firing. Calm, systemic.",
    mark: (c) =>
      `${S("M17 17 A7 7 0 0 1 17 31")}` +
      `${S("M17 12.5 A11.5 11.5 0 0 1 17 35.5")}` +
      `${S("M17 8 A16 16 0 0 1 17 40")}` +
      `<circle cx="17" cy="24" r="3.2" fill="${c.accent}"/>`,
  },
  {
    id: "prompt-wave",
    n: 8,
    name: "Prompt Wave",
    wordmark: "display",
    blurb:
      "A speech bubble whose contents are audio. It states the product thesis directly: you talk, it plays.",
    mark: (c) =>
      `<rect x="9" y="12" width="30" height="21" rx="7" fill="none" stroke="currentColor" stroke-width="2.2"/>` +
      `${S("M16 33 L13.5 39.5 L21 33", { width: 2.2 })}` +
      `${S("M13.5 22.5 h3 l2-5 3 9 2-6 1.5 2 h3", { stroke: c.accent, width: 2 })}`,
  },
  {
    id: "dendrite-play",
    n: 9,
    name: "Dendrite Play",
    wordmark: "display",
    blurb:
      "Neural branching resolving into a play-head. Growth, then sound — a library learning your taste.",
    mark: (c) =>
      `${S("M9 40 C13 33 15 29 18 25")}` +
      `${S("M18 25 C22 20 24.5 17.5 27 15.5")}` +
      `${S("M18 25 C22 27 25 28.5 28.5 28.5")}` +
      `${S("M14 31 C16 33 18 34.5 21 35", { width: 1.8 })}` +
      `<path d="M30.5 10 L40.5 15.5 L30.5 21 Z" fill="${c.accent}" stroke="${c.accent}" stroke-width="1.6" stroke-linejoin="round"/>`,
  },
  {
    id: "venn-synapse",
    n: 10,
    name: "Venn Synapse",
    wordmark: "mono",
    blurb:
      "Language set meets music set; the amber overlap is the playlist. A systems-diagram answer to the brief.",
    mark: (c, uid) =>
      `<defs><clipPath id="lens-${uid}"><circle cx="29" cy="24" r="10.5"/></clipPath></defs>` +
      `<g clip-path="url(#lens-${uid})"><circle cx="19" cy="24" r="10.5" fill="${c.accent}"/></g>` +
      `<circle cx="19" cy="24" r="10.5" fill="none" stroke="currentColor" stroke-width="2.2"/>` +
      `<circle cx="29" cy="24" r="10.5" fill="none" stroke="currentColor" stroke-width="2.2"/>` +
      `<path d="M24 20.5 v7 M21.6 24 h4.8" stroke="${c.bg}" stroke-width="1.6" stroke-linecap="round"/>`,
  },
  {
    id: "brain-split",
    n: 11,
    name: "Brain Split",
    wordmark: "display",
    blurb:
      "The Venn rebuilt from anatomy. Two hemispheres meet across one amber seam — the overlap is the longitudinal fissure, and the fissure is where the playlist forms.",
    mark: (c, uid) => brain(c, uid),
  },
  {
    id: "brain-wave",
    n: 12,
    name: "Brain Wave",
    wordmark: "mono",
    blurb:
      "The brain with a spectrum caught in its divide. The most SynAmp of the four — it points straight back at the Winamp equaliser.",
    mark: (c, uid) => brain(c, uid, { motif: seamEq(c) }),
  },
  {
    id: "brain-note",
    n: 13,
    name: "Brain Note",
    wordmark: "display",
    blurb:
      "A single note held in the seam. Language on one hemisphere, sound on the other, the note sitting exactly in the join between them.",
    mark: (c, uid) => brain(c, uid, { motif: seamNote(c) }),
  },
  {
    id: "brain-duet",
    n: 14,
    name: "Brain Duet",
    wordmark: "display",
    blurb:
      "Left hemisphere speaks, right hemisphere plays, the amber seam is the handshake. The clearest statement of the product thesis.",
    mark: (c, uid) => brain(c, uid, { motif: duet(), folds: false }),
  },
];
