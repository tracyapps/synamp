/* ============================================================================
   SynAmp Spectrum — hero visualizer
   An audio-reactive canvas mock of the SynAmp player. Four modes, four colour
   themes, seven generated demo loops (back / forward to change), play/pause,
   mute and volume.

   The sound is synthesised live with the Web Audio API — no audio file ships
   with the page. Each loop is a small step-sequenced groove with real
   transients (kick, snare, hats, bass, arp, pad) so the analyser actually has
   something to dance to.

   Behaviour:
   - Audio never autoplays; it starts on a real gesture only.
   - Before that, and whenever sound is stopped, the visualiser runs a calm
     simulated movement instead of freezing.
   - prefers-reduced-motion and Save-Data / slow connections get a still frame
     and an explicit opt-in. Pressing Pause returns them to the still frame.
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var saveData = !!(conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || "")));
  var PASSIVE_DEFAULT = reduceMotion || saveData;

  var THEMES = {
    spectrum: ["#AA006C", "#F6004F", "#FF4A47", "#E86B14", "#FFCD00", "#DEFC1A", "#00E676", "#00E6E8", "#3B6BFF", "#5216B3"],
    ember: ["#AA006C", "#F6004F", "#FF4A47", "#E86B14", "#FFCD00", "#FFDB4D"],
    aurora: ["#DEFC1A", "#00E676", "#00E6E8", "#3B6BFF", "#AB51FF", "#5216B3"],
    mono: ["#E0B400", "#FFCD00", "#FFDB4D", "#9AA1B8"]
  };
  var MODES = ["spectrum", "wave", "radial", "layers"];
  var MODE_LABEL = { spectrum: "Spectrum bars", wave: "Oscilloscope", radial: "Radial bloom", layers: "Layered waves" };

  /* --- Demo loops ----------------------------------------------------------
     Each loop is written like a drum machine's step grid. One character per
     step (a 16th note, or a triplet in the 12/8 loop); spaces and | are only
     there to make the bars easy to read.

       .  rest        g  ghost (quiet)      x  hit      X  accent
       r  buzz roll (four quick strokes)    f  flam (grace note, then the hit)

     Melodic parts use numbers: semitones above the part's root note.
       .  rest        -  keep holding the previous note
     On the slap bass, notes an octave or more up are "popped".
     Order here = order of the back / forward buttons.
     ------------------------------------------------------------------------- */
  var LOOPS = [
    {
      id: "neurofunk", level: 1, name: "Neuro-Funk", genre: "slap-bass funk", bpm: 100, swing: 0.1, theme: "ember",
      drums: {
        kick:  "X.......x.X..... | X.......x.....x.",
        snare: "....X..g.g..X..g | ....X..g.g..X.gg",
        hat:   "x.x.x.x.x.x.x.x. | x.x.x.x.x.x.x...",
        open:  "................ | ..............x."
      },
      bass: { sound: "slap", root: 40,
        notes: "0 . 12 . 0 0 . 12  10 . 0 . 7 . 12 10 | 0 . 12 . 0 . 3 5  7 . 12 . 10 7 5 3" },
      stab: { root: 52, chord: [3, 7, 10, 14], hits: "......x.......x. | ......x...x....." }
    },
    {
      id: "drumandbrain", level: 0.5, name: "Drum & Brain", genre: "drum & bass", bpm: 172, swing: 0, theme: "aurora",
      drums: {
        kick:  "X.........X..... | X.x.......X.....",
        snare: "....X..g....X..g | ....X..g.g..X...",
        hat:   "x.x.x.x.x.x.x.x. | x.x.x.x.x.x.x.xx",
        open:  "..............x. | ................"
      },
      bass: { sound: "reese", root: 33,
        notes: "0 - - - - - - - - - 3 - - - - - | -2 - - - - - - - 0 - - - 5 - 3 -" },
      lead: { sound: "bell", root: 69,
        notes: ". . . . . . . . . . . . . . . . | 12 . . 10 . . 7 . . . . . . . . ." },
      pad: { root: 57, chord: [0, 3, 7, 12] }
    },
    {
      id: "cerebrumclave", level: 1.35, name: "Cerebrum Clave", genre: "Afro-Cuban · son clave", bpm: 100, swing: 0, theme: "spectrum",
      drums: {
        clave:     "....X...X....... | X.....X.....X...",
        cowbell:   "X...x...X...x... | X...x...X...x...",
        congaHi:   "g.g...g.g.g..... | g.g...g.g.g.....",
        congaSlap: "....X........... | ....X...........",
        congaLo:   "............x.x. | ............x.x.",
        shaker:    "xgxgxgxgxgxgxgxg | xgxgxgxgxgxgxgxg",
        kick:      "g.......g....... | g.......g......."
      },
      // Tumbao: the bass lands just before the beat, never on the one.
      bass: { sound: "upright", root: 36,
        notes: ". . . . . . 7 - - - - - 0 - - - | . . . . . . 5 - - - - - 7 - - -" },
      lead: { sound: "piano", root: 60,
        notes: "0 . 7 4 . 7 . 4  0 . 7 4 . 7 . 4 | 5 . 9 5 . 12 . 9  7 . 11 7 . 14 . 11" }
    },
    {
      id: "marchingneurons", level: 1.4, name: "Marching Neurons", genre: "drumline", bpm: 116, swing: 0, theme: "ember",
      drums: {
        msnare: "X.x.X.x.r...X.xx | X.gxX.gxr.r.X.f.",
        tomHi:  "................ | ........x.x.....",
        tomMid: "................ | .........x.x....",
        tomLo:  "................ | ..............x.",
        bd1:    "..x.......x..... | ..x.............",
        bd2:    "......x.......x. | ......x.........",
        bd3:    "....x.......x... | ....x...........",
        bd4:    "X.......X....... | X.......X...X...",
        crash:  "X............... | ............X..."
      }
    },
    {
      id: "cortexcircle", level: 1.4, name: "Cortex Circle", genre: "drum circle · 12/8", bpm: 104, beat: 3, theme: "aurora",
      drums: {
        cowbell:   "X.x.xx.x.x.x | X.x.xx.x.x.x",
        dunun:     "X.....x..x.. | X.....x.x...",
        djBass:    "X.....X..... | X.....X.....",
        congaHi:   "...x.x....x. | ...x.x...xx.",
        congaSlap: "..x.....x... | ..x.....x.xx",
        shaker:    "xggxggxggxgg | xggxggxggxgg"
      }
    },
    {
      id: "partysynapse", level: 1.15, name: "Party Synapse", genre: "house · more cowbell", bpm: 124, swing: 0, theme: "spectrum",
      drums: {
        kick:    "X...X...X...X... | X...X...X...X...",
        clap:    "....X.......X... | ....X.......X...",
        hat:     ".g.g.g.g.g.g.g.g | .g.g.g.g.g.g.g.g",
        open:    "..x...x...x...x. | ..x...x...x...x.",
        cowbell: "..x..x....x..x.. | ..x..x....x.x.x."
      },
      bass: { sound: "saw", root: 45,
        notes: ". . 0 . . . 0 . . . 0 . . . 0 12 | . . 3 . . . 3 . . . 5 . . . 5 7" },
      lead: { sound: "pluck", root: 69,
        notes: "0 . 3 7 10 7 3 0 -2 . 0 3 7 3 0 -2 | 0 . 3 7 10 7 3 0 3 . 5 7 10 12 10 7" },
      pad: { root: 57, chord: [0, 3, 7, 10] }
    },
    {
      id: "brainfreeze", level: 0.6, name: "Brain Freeze", genre: "chill · sparse and glassy", bpm: 84, swing: 0.06, theme: "aurora",
      drums: {
        kick: "X.........x..... | X.......x.......",
        rim:  "....x.......x... | ....x.......x..x",
        hat:  "..g...g...g...g. | ..g...g...g.g.g."
      },
      bass: { sound: "sub", root: 38,
        notes: "0 - - - - - - - - - - - 5 - - - | 3 - - - - - - - - - - - 7 - - -" },
      lead: { sound: "bell", root: 74,
        notes: "0 . . 7 . . 12 . . 10 . . 7 . . . | 3 . . 10 . . 15 . . 14 . . 10 . 7 ." },
      pad: { root: 62, chord: [0, 3, 7, 10, 14] }
    }
  ];

  var HIT = { ".": 0, g: 0.32, x: 0.7, X: 1, r: 0.75, f: 0.9 };
  function grid(str) { return String(str || "").replace(/[\s|]/g, "").split(""); }
  function melody(str) {
    return String(str || "").replace(/\|/g, " ").trim().split(/\s+/).map(function (t) {
      return t === "." ? null : t === "-" ? "-" : Number(t);
    });
  }
  LOOPS.forEach(function (l) {
    l.beat = l.beat || 4;
    l._drums = {};
    var longest = 0;
    Object.keys(l.drums || {}).forEach(function (k) { l._drums[k] = grid(l.drums[k]); longest = Math.max(longest, l._drums[k].length); });
    ["bass", "lead"].forEach(function (part) { if (l[part]) { l[part]._notes = melody(l[part].notes); longest = Math.max(longest, l[part]._notes.length); } });
    if (l.stab) { l.stab._hits = grid(l.stab.hits); longest = Math.max(longest, l.stab._hits.length); }
    l.steps = longest || 16;
    l.sub = l.genre + " · " + l.bpm + " BPM";
  });
  function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }


  function hexToRgb(h) {
    h = h.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function ramp(stops, t) {
    t = Math.max(0, Math.min(1, t));
    var x = t * (stops.length - 1), i = Math.floor(x);
    if (i >= stops.length - 1) return hexToRgb(stops[stops.length - 1]);
    return mix(hexToRgb(stops[i]), hexToRgb(stops[i + 1]), x - i);
  }
  function rgba(c, a) { return "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + a + ")"; }

  function mount(root) {
    var canvas = root.querySelector("canvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var bands = new Float32Array(72);
    var wave = new Float32Array(256);
    var dpr = 1, w = 0, h = 0;

    var state = {
      mode: root.dataset.mode || "spectrum",
      theme: root.dataset.theme || "spectrum",
      playing: false,   // sound + motion, after a real gesture
      idle: false,      // calm simulated motion (silent, or after sound is paused)
      energy: 0.3,
      bass: 0,
      t: 0,
      raf: 0,
      last: 0,
      audio: null,
      volume: 0.5,
      muted: false,
      themeChosen: false,
      loop: LOOPS[0]
    };

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = root.clientWidth; h = root.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* ---- Signal ---------------------------------------------------------- */
    function virtualBands(t) {
      var n = bands.length;
      var bp = (t % 0.62) / 0.62;
      var kick = Math.exp(-bp * 7);
      for (var i = 0; i < n; i++) {
        var x = i / n, v = 0;
        v += 0.95 * Math.exp(-Math.pow((x - (0.13 + 0.05 * Math.sin(t * 0.5))) * 7, 2));
        v += 0.72 * Math.exp(-Math.pow((x - (0.33 + 0.05 * Math.sin(t * 0.37 + 1))) * 5, 2));
        v += 0.5 * Math.exp(-Math.pow((x - (0.6 + 0.08 * Math.sin(t * 0.23 + 2))) * 6, 2));
        v *= 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.4 + i * 0.12));
        v += 0.34 * kick * Math.exp(-x * 3.2);
        v *= Math.exp(-x * 0.45) + 0.3;
        bands[i] = Math.max(0, Math.min(1, v));
      }
      for (var k = 0; k < wave.length; k++) {
        var p = k / wave.length;
        wave[k] = (Math.sin(p * 12 + t * 1.1) * 0.6 + Math.sin(p * 5 - t * 0.8) * 0.3 + Math.sin(p * 27 + t * 1.9) * 0.1) * (0.4 + 0.2 * kick) * Math.sin(Math.PI * p);
      }
    }
    function realBands(db, td) {
      var n = bands.length;
      var step = Math.floor(db.length / n);
      for (var i = 0; i < n; i++) {
        var m = 0;
        for (var j = 0; j < step; j++) m = Math.max(m, db[i * step + j]);
        bands[i] = Math.pow(m / 255, 1.25);
      }
      for (var k = 0; k < wave.length; k++) wave[k] = td[Math.floor(k / wave.length * td.length)] / 128 - 1;
    }
    function computeEnergy() {
      var sum = 0, i;
      for (i = 0; i < bands.length; i++) sum += bands[i];
      var e = sum / bands.length;
      var b = 0; for (i = 0; i < 8; i++) b += bands[i]; b /= 8;
      state.energy += (e - state.energy) * 0.22;
      state.bass += (b - state.bass) * 0.32;
    }

    /* ---- Audio engine — a tiny drum machine and a few synths --------------- */
    function ensureAudio() {
      if (state.audio) return state.audio;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      var api = buildEngine(new AC());
      api.timer = setInterval(function () { runScheduler(api); }, 25);
      state.audio = api;
      return api;
    }
    function buildEngine(ac) {
      var master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
      var analyser = ac.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.72;
      var bus = ac.createGain(); bus.gain.value = 0.8;
      if (ac.createDynamicsCompressor) {
        var comp = ac.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
        bus.connect(comp); comp.connect(analyser);
      } else { bus.connect(analyser); }
      analyser.connect(master);

      var nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      var nd = nb.getChannelData(0);
      for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

      /* building blocks */
      function env(g, t, a, peak, dec) {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + a);
        g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
      }
      function tone(t, type, f, peak, dec, opts) {
        opts = opts || {};
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = type; o.frequency.setValueAtTime(f * (opts.from || 1), t);
        if (opts.from) o.frequency.exponentialRampToValueAtTime(f, t + (opts.glide || 0.04));
        env(g, t, opts.attack || 0.002, peak, dec);
        o.connect(g); g.connect(opts.to || bus); o.start(t); o.stop(t + (opts.attack || 0.002) + dec + 0.05);
        return o;
      }
      function noise(t, peak, dec, filter, freq, q, attack) {
        var n = ac.createBufferSource(); n.buffer = nb;
        n.loopStart = 0; n.loopEnd = 1; n.loop = true;
        var f = ac.createBiquadFilter(); f.type = filter; f.frequency.value = freq; if (q) f.Q.value = q;
        var g = ac.createGain(); env(g, t, attack || 0.001, peak, dec);
        var off = Math.random() * 0.5;
        n.connect(f); f.connect(g); g.connect(bus); n.start(t, off); n.stop(t + (attack || 0.001) + dec + 0.05);
      }

      /* drums: each takes a start time and a velocity (0–1) */
      var drums = {
        kick: function (t, v) {
          var o = ac.createOscillator(), g = ac.createGain();
          o.type = "sine"; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.26);
          env(g, t, 0.003, 0.95 * v, 0.34); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.45);
          noise(t, 0.12 * v, 0.012, "highpass", 3000);
        },
        snare: function (t, v) {
          noise(t, 0.5 * v, v < 0.4 ? 0.07 : 0.17, "highpass", 1500);
          tone(t, "triangle", 190, 0.22 * v, 0.1);
        },
        msnare: function (t, v) { // marching snare: tight, high, cracking
          noise(t, 0.55 * v, 0.09, "bandpass", 3200, 0.8);
          noise(t, 0.25 * v, 0.03, "highpass", 6000);
          tone(t, "triangle", 330, 0.25 * v, 0.05, { from: 1.3, glide: 0.02 });
        },
        hat: function (t, v) { noise(t, 0.11 * v, 0.045, "highpass", 7600); },
        open: function (t, v) { noise(t, 0.13 * v, 0.26, "highpass", 7200); },
        clap: function (t, v) {
          for (var k = 0; k < 3; k++) noise(t + k * 0.011, 0.32 * v, 0.02, "bandpass", 1300, 1.2);
          noise(t + 0.033, 0.3 * v, 0.16, "bandpass", 1200, 1);
        },
        rim: function (t, v) {
          tone(t, "triangle", 820, 0.25 * v, 0.04);
          noise(t, 0.15 * v, 0.02, "bandpass", 2600, 2);
        },
        cowbell: function (t, v) { // the 808 recipe: two square waves through a band-pass
          var bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 0.9;
          var g = ac.createGain();
          g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32 * v, t + 0.002);
          g.gain.exponentialRampToValueAtTime(0.09 * v, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
          bp.connect(g); g.connect(bus);
          [562, 845].forEach(function (f) { var o = ac.createOscillator(); o.type = "square"; o.frequency.value = f; o.connect(bp); o.start(t); o.stop(t + 0.4); });
        },
        clave: function (t, v) { tone(t, "sine", 2500, 0.32 * v, 0.05); tone(t, "triangle", 1250, 0.08 * v, 0.03); },
        congaHi: function (t, v) { conga(t, v, 330); },
        congaLo: function (t, v) { conga(t, v, 220); },
        congaSlap: function (t, v) {
          noise(t, 0.35 * v, 0.05, "bandpass", 2200, 1.4);
          tone(t, "sine", 520, 0.25 * v, 0.07, { from: 1.15, glide: 0.02 });
        },
        djBass: function (t, v) { tone(t, "sine", 92, 0.7 * v, 0.32, { from: 1.6, glide: 0.05 }); },
        dunun: function (t, v) { drumTom(t, v, 68, 0.5); },
        shaker: function (t, v) { noise(t, 0.1 * v, 0.06, "bandpass", 6800, 0.9, 0.012); },
        tomHi: function (t, v) { drumTom(t, v, 300, 0.22); },
        tomMid: function (t, v) { drumTom(t, v, 230, 0.26); },
        tomLo: function (t, v) { drumTom(t, v, 170, 0.3); },
        bd1: function (t, v) { drumTom(t, v, 140, 0.32); },
        bd2: function (t, v) { drumTom(t, v, 112, 0.36); },
        bd3: function (t, v) { drumTom(t, v, 90, 0.4); },
        bd4: function (t, v) { drumTom(t, v, 70, 0.45); },
        crash: function (t, v) {
          noise(t, 0.09 * v, 1.0, "highpass", 4200);
          noise(t, 0.05 * v, 0.5, "bandpass", 9000, 0.7);
        }
      };
      function conga(t, v, f) {
        if (v < 0.4) { tone(t, "sine", f, 0.22 * v * 2, 0.06); return; } // muted heel/toe
        tone(t, "sine", f, 0.42 * v, 0.24, { from: 1.08, glide: 0.03 });
        tone(t, "triangle", f * 2.02, 0.06 * v, 0.08);
      }
      function drumTom(t, v, f, dec) {
        tone(t, "sine", f, 0.6 * v, dec, { from: 1.7, glide: 0.06 });
        noise(t, 0.12 * v, 0.02, "lowpass", 1600);
      }

      /* bass and melody: (start, frequency, length in seconds, velocity) */
      var synths = {
        saw: function (t, f, len) {
          var o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
          o.type = "sawtooth"; o.frequency.value = f;
          lp.type = "lowpass"; lp.Q.value = 6;
          lp.frequency.setValueAtTime(950, t); lp.frequency.exponentialRampToValueAtTime(260, t + 0.22);
          env(g, t, 0.006, 0.45, Math.min(len, 0.3)); o.connect(lp); lp.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.4);
        },
        slap: function (t, f, len, pop) {
          var g = ac.createGain(), lp = ac.createBiquadFilter();
          lp.type = "lowpass"; lp.Q.value = pop ? 7 : 4;
          lp.frequency.setValueAtTime(pop ? 4200 : 2600, t); lp.frequency.exponentialRampToValueAtTime(pop ? 900 : 380, t + (pop ? 0.12 : 0.18));
          var dec = Math.min(len + 0.05, pop ? 0.22 : 0.32);
          env(g, t, 0.002, pop ? 0.42 : 0.55, dec);
          lp.connect(g); g.connect(bus);
          ["sawtooth", "square"].forEach(function (type, k) {
            var o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = k ? 4 : -4;
            o.connect(lp); o.start(t); o.stop(t + dec + 0.05);
          });
          noise(t, pop ? 0.22 : 0.16, 0.012, "bandpass", pop ? 3500 : 1800, 1.5); // the thumb or the snap
        },
        reese: function (t, f, len) {
          var g = ac.createGain(), lp = ac.createBiquadFilter();
          lp.type = "lowpass"; lp.Q.value = 3; lp.frequency.value = 520;
          var lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.6; lg.gain.value = 300;
          lfo.connect(lg); lg.connect(lp.frequency);
          g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32, t + 0.02);
          g.gain.setValueAtTime(0.32, t + Math.max(0.03, len - 0.06)); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.04);
          lp.connect(g); g.connect(bus);
          [-14, 14].forEach(function (cents) {
            var o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = cents;
            o.connect(lp); o.start(t); o.stop(t + len + 0.1);
          });
          var sub = ac.createOscillator(), sg = ac.createGain(); sub.type = "sine"; sub.frequency.value = f;
          sg.gain.setValueAtTime(0.0001, t); sg.gain.linearRampToValueAtTime(0.5, t + 0.02);
          sg.gain.setValueAtTime(0.5, t + Math.max(0.03, len - 0.06)); sg.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.04);
          sub.connect(sg); sg.connect(bus); sub.start(t); sub.stop(t + len + 0.1);
          lfo.start(t); lfo.stop(t + len + 0.1);
        },
        sub: function (t, f, len) {
          var g = ac.createGain();
          g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.03);
          g.gain.setValueAtTime(0.5, t + Math.max(0.04, len - 0.1)); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.08);
          g.connect(bus);
          var o = ac.createOscillator(); o.type = "sine"; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + len + 0.15);
        },
        upright: function (t, f, len) {
          var lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900; lp.connect(bus);
          var g = ac.createGain(); env(g, t, 0.004, 0.6, Math.min(len, 0.7)); g.connect(lp);
          ["triangle", "sine"].forEach(function (type, k) { var o = ac.createOscillator(); o.type = type; o.frequency.value = f * (k ? 2 : 1); o.connect(g); o.start(t); o.stop(t + Math.min(len, 0.7) + 0.05); });
        },
        pluck: function (t, f) { tone(t, "triangle", f, 0.22, 0.26); },
        piano: function (t, f) {
          var lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.3); lp.connect(bus);
          tone(t, "triangle", f, 0.2, 0.42, { to: lp });
          tone(t, "sine", f * 2, 0.07, 0.25, { to: lp });
        },
        bell: function (t, f, len) { // two-operator FM: glassy
          var car = ac.createOscillator(), mod = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain();
          car.type = "sine"; car.frequency.value = f; mod.type = "sine"; mod.frequency.value = f * 3.5;
          mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.6);
          mod.connect(mg); mg.connect(car.frequency);
          var dec = Math.max(0.6, Math.min(len, 1.4));
          env(g, t, 0.003, 0.16, dec); car.connect(g); g.connect(bus);
          car.start(t); mod.start(t); car.stop(t + dec + 0.1); mod.stop(t + dec + 0.1);
        }
      };
      function stab(t, freqs) { // clavinet-ish chord stab
        var lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.12); lp.connect(bus);
        freqs.forEach(function (f) { tone(t, "square", f, 0.05, 0.13, { to: lp }); });
      }
      function pad(t, dur, freqs) {
        var g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.045, t + 0.6);
        g.gain.setValueAtTime(0.045, Math.max(t + 0.6, t + dur - 0.8));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        var lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1200; lp.connect(g); g.connect(bus);
        freqs.forEach(function (f, i) {
          var o = ac.createOscillator(); o.type = i ? "triangle" : "sine"; o.frequency.value = f;
          var og = ac.createGain(); og.gain.value = 0.5 / (1 + i * 0.6);
          var lfo = ac.createOscillator(); lfo.frequency.value = 0.07 + i * 0.03;
          var lg = ac.createGain(); lg.gain.value = 3;
          lfo.connect(lg); lg.connect(o.detune);
          o.connect(og); og.connect(lp);
          o.start(t); o.stop(t + dur + 0.1); lfo.start(t); lfo.stop(t + dur + 0.1);
        });
      }

      var api = {
        ac: ac, master: master, analyser: analyser,
        db: new Uint8Array(analyser.frequencyBinCount), td: new Uint8Array(analyser.fftSize),
        bus: bus, drums: drums, synths: synths, stab: stab, pad: pad,
        step: 0, next: ac.currentTime + 0.08, timer: 0
      };
      return api;
    }

    /** Render a loop to an AudioBuffer without playing it (used to check the loops by ear and by meter). */
    function renderLoop(id, bars) {
      var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      var loop = LOOPS.filter(function (l) { return l.id === id; })[0];
      if (!OAC || !loop) return Promise.reject(new Error("can't render " + id));
      var stepDur = 60 / loop.bpm / loop.beat;
      var steps = loop.steps * (bars || 2);
      var ac = new OAC(2, Math.ceil((steps * stepDur + 1.5) * 44100), 44100);
      var a = buildEngine(ac);
      a.master.gain.value = 0.5;
      for (var i = 0; i < steps; i++) scheduleStep(a, loop, i % loop.steps, 0.05 + i * stepDur, stepDur);
      return ac.startRendering();
    }
    window.SynAmpVisualizer = window.SynAmpVisualizer || {};
    window.SynAmpVisualizer.renderLoop = renderLoop;

    /** How many steps a note lasts: itself plus any "-" after it. */
    function holdSteps(notes, step) {
      var n = 1;
      while (notes[step + n] === "-") n++;
      return n;
    }
    function playMelody(a, part, step, t, stepDur) {
      if (!part) return;
      var note = part._notes[step];
      if (typeof note !== "number" || isNaN(note)) return;
      var len = holdSteps(part._notes, step) * stepDur;
      var voice = a.synths[part.sound] || a.synths.pluck;
      voice(t, midi(part.root + note), len, part.sound === "slap" && note >= 12);
    }
    function scheduleStep(a, loop, step, t, stepDur) {
      // Some loops are naturally louder (long bass notes); even them out.
      if (step === 0) a.bus.gain.setTargetAtTime(0.8 * (loop.level || 1), t, 0.05);
      // Swing: push every second 16th a little late.
      if (loop.swing && loop.beat === 4 && step % 2 === 1) t += loop.swing * stepDur;
      Object.keys(loop._drums).forEach(function (name) {
        var c = loop._drums[name][step];
        var v = HIT[c];
        var hit = a.drums[name];
        if (!v || !hit) return;
        if (c === "r") { for (var k = 0; k < 4; k++) hit(t + k * stepDur / 4, v * (0.55 + k * 0.12)); }
        else if (c === "f") { hit(t - 0.022, v * 0.45); hit(t, v); }
        else hit(t, v);
      });
      playMelody(a, loop.bass, step, t, stepDur);
      playMelody(a, loop.lead, step, t, stepDur);
      if (loop.stab && HIT[loop.stab._hits[step]]) a.stab(t, loop.stab.chord.map(function (s) { return midi(loop.stab.root + s); }));
      if (loop.pad && step === 0) a.pad(t, stepDur * loop.steps, loop.pad.chord.map(function (s) { return midi(loop.pad.root + s); }));
    }
    function runScheduler(a) {
      if (!state.playing) { a.next = Math.max(a.next, a.ac.currentTime + 0.05); return; }
      var loop = state.loop;
      var stepDur = 60 / loop.bpm / loop.beat;
      while (a.next < a.ac.currentTime + 0.12) {
        scheduleStep(a, loop, a.step % loop.steps, a.next, stepDur);
        a.next += stepDur;
        a.step = (a.step + 1) % loop.steps;
      }
    }

    function level() { return state.muted ? 0 : state.volume; }

    /* ---- Renderers ------------------------------------------------------- */
    function drawBackdrop() {
      var g = ctx.createRadialGradient(w * 0.5, h * (state.mode === "radial" ? 0.54 : 0.58), 0, w * 0.5, h * 0.6, Math.max(w, h) * 0.72);
      var accent = ramp(THEMES[state.theme], 0.35);
      g.addColorStop(0, rgba(mix([14, 14, 16], accent, 0.14 + state.energy * 0.14), 1));
      g.addColorStop(0.55, "rgba(14,14,16,0.9)");
      g.addColorStop(1, "#0E0E10");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    function drawSpectrum() {
      var n = bands.length;
      var gap = Math.max(2, w / 340);
      var bw = (w - gap * (n + 1)) / n;
      var base = h * 0.94;
      for (var i = 0; i < n; i++) {
        var v = bands[i] * (0.5 + state.energy * 0.9);
        var bh = Math.max(3, v * h * 0.72);
        var c = ramp(THEMES[state.theme], i / (n - 1));
        var x = gap + i * (bw + gap);
        ctx.fillStyle = rgba(c, 0.95);
        ctx.fillRect(x, base - bh, bw, bh);
        ctx.fillStyle = rgba(mix(c, [255, 255, 255], 0.6), 0.95);
        ctx.fillRect(x, base - bh, bw, Math.min(3, bh));
      }
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(0, base + 1, w, 1);
    }
    function drawWave() {
      var mid = h * 0.5, amp = h * 0.26 * (0.55 + state.energy * 1.1);
      ctx.lineWidth = 2.2; ctx.lineJoin = "round";
      for (var layer = 0; layer < 2; layer++) {
        ctx.beginPath();
        for (var i = 0; i < wave.length; i++) {
          var x = (i / (wave.length - 1)) * w;
          var y = mid + wave[i] * amp * (layer ? -0.55 : 1);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        if (layer === 0) {
          var lg = ctx.createLinearGradient(0, 0, w, 0);
          THEMES[state.theme].forEach(function (s, k, a) { lg.addColorStop(k / (a.length - 1), s); });
          ctx.strokeStyle = lg; ctx.lineWidth = 2.6; ctx.globalAlpha = 0.95;
        } else { ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 1.4; ctx.globalAlpha = 1; }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    function drawRadial() {
      var cx = w / 2, cy = h * 0.54, n = bands.length;
      var baseR = Math.min(w, h) * 0.18;
      var rot = state.t * 0.18;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      for (var i = 0; i < n; i++) {
        var a = (i / n) * Math.PI * 2;
        var v = bands[i] * (0.5 + state.energy);
        var r0 = baseR + state.bass * 14;
        var r1 = r0 + 10 + v * Math.min(w, h) * 0.3;
        var c = ramp(THEMES[state.theme], i / (n - 1));
        ctx.strokeStyle = rgba(c, 0.9); ctx.lineWidth = 3; ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(255,255,255,0.1)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, Math.max(1, baseR - 6), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // Layered mirrored waves — two soft filled bands that overlap and bloom
    // through each other in the middle. Calm by design: low-frequency motion.
    function layerValue(t, phase) {
      var idx = Math.max(0, Math.min(255, Math.floor(t * 255)));
      var live = wave[idx];
      var proc = Math.sin(t * Math.PI * 2 * 0.9 + state.t * 0.45 + phase) * 0.44
        + Math.sin(t * Math.PI * 2 * 2.1 - state.t * 0.55 + phase * 1.7) * 0.2
        + Math.sin(t * Math.PI * 2 * 3.7 + state.t * 0.8 + phase * 0.6) * 0.09;
      var env = 0.55 + 0.45 * Math.sin(t * Math.PI);
      return (live * 0.85 + proc) * env;
    }
    function drawLayers() {
      var mid = h * 0.5;
      var amp = Math.min(h * 0.46, w * 0.24) * (0.55 + state.energy * 0.9);
      var N = 180;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      [
        { phase: 0, shade: 0.06, alpha: 0.72 },
        { phase: Math.PI * 0.62, shade: 0.86, alpha: 0.66 }
      ].forEach(function (cfg) {
        var col = ramp(THEMES[state.theme], cfg.shade);
        ctx.beginPath();
        ctx.moveTo(0, mid);
        var i, t, v;
        for (i = 0; i <= N; i++) { t = i / N; v = layerValue(t, cfg.phase); ctx.lineTo(t * w, mid - v * amp); }
        for (i = N; i >= 0; i--) { t = i / N; v = layerValue(t, cfg.phase + 0.5); ctx.lineTo(t * w, mid - v * amp * 0.92); }
        ctx.closePath();
        var g = ctx.createLinearGradient(0, mid - amp, 0, mid + amp);
        g.addColorStop(0, rgba(col, cfg.alpha * 0.55));
        g.addColorStop(0.5, rgba(mix(col, [255, 255, 255], 0.22), cfg.alpha));
        g.addColorStop(1, rgba(col, cfg.alpha * 0.55));
        ctx.fillStyle = g; ctx.fill();
      });
      ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(0, mid, w, 1);
    }

    function frame(now) {
      state.raf = 0;
      if (!state.last) state.last = now;
      var dt = Math.min(0.05, (now - state.last) / 1000); state.last = now;
      if (state.playing) state.t += dt;
      else if (state.idle) state.t += dt * 0.6;

      var a = state.audio;
      if (state.playing && a && a.ac) {
        a.analyser.getByteFrequencyData(a.db);
        a.analyser.getByteTimeDomainData(a.td);
        realBands(a.db, a.td);
        a.master.gain.setTargetAtTime(level() * 0.5, a.ac.currentTime, 0.2);
      } else {
        virtualBands(state.t || now / 1000);
        if (a && a.ac) a.master.gain.setTargetAtTime(0, a.ac.currentTime, 0.15);
      }
      computeEnergy();

      drawBackdrop();
      if (state.mode === "wave") drawWave();
      else if (state.mode === "radial") drawRadial();
      else if (state.mode === "layers") drawLayers();
      else drawSpectrum();

      if (state.playing || state.idle) state.raf = requestAnimationFrame(frame);
    }
    function renderStill() {
      virtualBands(state.t + 0.2);
      computeEnergy();
      drawBackdrop();
      if (state.mode === "wave") drawWave();
      else if (state.mode === "radial") drawRadial();
      else if (state.mode === "layers") drawLayers();
      else drawSpectrum();
    }

    /* ---- Transport ------------------------------------------------------- */
    function start() {
      state.playing = true; state.idle = false; state.last = 0;
      var a = ensureAudio();
      if (a && a.ac) {
        if (a.ac.state === "suspended") a.ac.resume();
        a.next = a.ac.currentTime + 0.08; a.step = 0;
      }
      if (!state.raf) state.raf = requestAnimationFrame(frame);

    }
    function stop() {
      state.playing = false;
      var a = state.audio;
      if (a && a.ac) a.master.gain.setTargetAtTime(0, a.ac.currentTime, 0.12);
      if (PASSIVE_DEFAULT) {
        state.idle = false;
        if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
        renderStill();
      } else {
        state.idle = true;
        if (!state.raf) state.raf = requestAnimationFrame(frame);
      }
    }
    function setLoop(id, announce) {
      var loop = LOOPS.filter(function (l) { return l.id === id; })[0] || LOOPS[0];
      state.loop = loop;
      var a = state.audio;
      if (a && a.ac && state.playing) { a.next = a.ac.currentTime + 0.05; a.step = 0; }
      // Each loop brings its own colours, unless you picked a theme yourself.
      if (!state.themeChosen && root.dataset.loop && loop.theme && THEMES[loop.theme]) { state.theme = loop.theme; syncUI(); if (!state.playing && !state.idle) renderStill(); }
      var index = LOOPS.indexOf(loop) + 1;
      root.querySelectorAll("[data-viz-track]").forEach(function (el) { el.textContent = loop.name; });
      root.querySelectorAll("[data-viz-track-sub]").forEach(function (el) { el.textContent = loop.sub; });
      root.querySelectorAll("[data-viz-track-count]").forEach(function (el) { el.textContent = "Loop " + index + " of " + LOOPS.length; });
      var live = root.querySelector("[data-viz-announce]");
      if (live && announce) live.textContent = "Now on loop " + index + " of " + LOOPS.length + ": " + loop.name + ", " + loop.genre + ".";
      root.querySelectorAll('button[data-viz="loop"]').forEach(function (b) {
        var on = b.getAttribute("data-value") === loop.id;
        b.setAttribute("aria-pressed", String(on));
        if (b.classList.contains("chip")) b.classList.toggle("is-active", on);
      });
    }

    /* ---- Controls -------------------------------------------------------- */
    function syncUI() {
      root.dataset.mode = state.mode; root.dataset.theme = state.theme;
      var pb = root.querySelector('[data-viz="play"]');
      if (pb) {
        pb.setAttribute("aria-pressed", String(state.playing));
        pb.setAttribute("aria-label", state.playing ? "Pause sound" : "Play sound");
        var txt = pb.querySelector("[data-viz-label]"); if (txt) txt.textContent = state.playing ? "Pause" : "Play";
        pb.querySelectorAll("[data-icon-play]").forEach(function (n) { n.hidden = state.playing; });
        pb.querySelectorAll("[data-icon-pause]").forEach(function (n) { n.hidden = !state.playing; });
      }
      root.querySelectorAll('[data-viz="mode"]').forEach(function (b) {
        var on = b.getAttribute("data-value") === state.mode;
        b.setAttribute("aria-pressed", String(on));
      });
      root.querySelectorAll('[data-viz="theme"]').forEach(function (b) {
        var on = b.getAttribute("data-value") === state.theme;
        b.setAttribute("aria-pressed", String(on));
      });
      var name = root.querySelector("[data-viz-mode-name]"); if (name) name.textContent = MODE_LABEL[state.mode];
      var note = root.querySelector("[data-viz-note]");
      if (note) note.hidden = !PASSIVE_DEFAULT || state.playing;
    }

    root.addEventListener("click", function (e) {
      var el = e.target.closest("[data-viz]"); if (!el) return;
      var kind = el.getAttribute("data-viz");
      if (kind === "play") { state.playing ? stop() : start(); syncUI(); }
      else if (kind === "mode") { state.mode = el.getAttribute("data-value"); renderStill(); syncUI(); }
      else if (kind === "theme") { state.theme = el.getAttribute("data-value"); state.themeChosen = true; renderStill(); syncUI(); }
      else if (kind === "loop") { var lv = el.getAttribute("data-value"); if (lv) setLoop(lv, true); }
      else if (kind === "prev" || kind === "next") {
        var at = LOOPS.indexOf(state.loop) + (kind === "next" ? 1 : -1);
        setLoop(LOOPS[(at + LOOPS.length) % LOOPS.length].id, true);
      }
      else if (kind === "mute") {
        state.muted = !state.muted; el.setAttribute("aria-pressed", String(state.muted));
        var mt = el.querySelector("span"); if (mt) mt.textContent = state.muted ? "Muted" : "Sound";
      }
    });
    var vol = root.querySelector('[data-viz="volume"]');
    if (vol) vol.addEventListener("input", function () { state.volume = vol.value / 100; state.muted = false; });

    /* ---- Lifecycle ------------------------------------------------------- */
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!state.playing && !state.idle) return;
        var a = state.audio;
        if (en.isIntersecting) {
          if (!state.raf) state.raf = requestAnimationFrame(frame);
          if (state.playing && a && a.ac && a.ac.state === "suspended") a.ac.resume();
        } else {
          if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
          if (state.playing && a && a.ac && a.ac.state === "running") a.ac.suspend();
        }
      });
    }, { threshold: 0.15 });
    io.observe(root);

    document.addEventListener("visibilitychange", function () {
      var a = state.audio;
      if (document.hidden && a && a.ac && a.ac.state === "running") a.ac.suspend();
      else if (!document.hidden && state.playing && a && a.ac && a.ac.state === "suspended") a.ac.resume();
    });

    window.addEventListener("resize", function () { resize(); if (!state.playing) renderStill(); }, { passive: true });
    if ("ResizeObserver" in window) {
      var ro = new ResizeObserver(function () { resize(); if (!state.playing) renderStill(); });
      ro.observe(root);
    }

    setLoop(root.dataset.loop || LOOPS[0].id);
    resize();
    if (PASSIVE_DEFAULT) { renderStill(); }
    else { state.idle = true; state.raf = requestAnimationFrame(frame); }
    syncUI();
  }

  window.SynAmpVisualizer = window.SynAmpVisualizer || {};
  Object.assign(window.SynAmpVisualizer, { mount: mount, modes: MODES, themes: Object.keys(THEMES), loops: LOOPS.map(function (l) { return l.id; }), passiveDefault: PASSIVE_DEFAULT });
  document.addEventListener("DOMContentLoaded", function () {
    Array.prototype.slice.call(document.querySelectorAll("[data-visualizer]")).forEach(mount);
  });
})();
