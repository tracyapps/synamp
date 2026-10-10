"""The `voice` stage: does a song have singing or speech, and which instruments play.

Model: PANNs CNN14 (Kong et al., 2020), an AudioSet sound-event tagger.
Code: the network below follows qiuqiangkong/audioset_tagging_cnn (MIT licence).
Weights: "Cnn14_mAP=0.431.pth" from Zenodo record 3987831 (Creative Commons
Attribution 4.0, checked 2026-10-09), downloaded once to ~/panns_data and
checked against its SHA-256. CC BY 4.0 asks for credit: Kong et al., "PANNs:
Large-Scale Pretrained Audio Neural Networks for Audio Pattern Recognition"
(2020). The AudioSet ontology (class names) is CC BY 4.0 too.

How the numbers are made (chosen on ~40 songs from the owner's library,
2026-10-08 — see docs/synamp/plans/AGENT-ROADMAP.md):

* The song is cut into 10-second windows (at most 30, spread evenly).
* A window "has a voice" when any singing class (Singing, Choir, Rapping, …)
  or speech class is above 0.10. Instrumental Eno and Balmorhea stayed at or
  below 0.05; sung pop and rock reached 0.15–0.6 somewhere in the song.
* vocal_fraction = share of windows with a voice. instrumental = 1 − that.
* instruments.<name> = share of windows where that instrument is above 0.10.
* moods.<name> = the average, over the windows, of AudioSet's seven music-mood
  classes (Happy, Funny, Sad, Tender, Exciting, Angry, Scary music). Kept raw:
  these classes are weak on their own, so the brain turns them into calm↔lively
  and sad↔happy only after they are checked against the owner's own ears.

Known limits: a voice buried deep in the mix (Eno's own early songs) can be
missed; wordless choirs count as voice (they are singing, though not words).

The same pass also keeps a "sound vector" for "sounds like these songs": the
network's 2048-number summary of each window (the layer before it names
sounds), averaged over the song, projected to 128 numbers with a fixed random
matrix (distances survive that projection), and stored as 128 signed bytes in
base64. The brain centres them on the library's average before comparing.
"""

from __future__ import annotations

import hashlib
import os
import urllib.request
from pathlib import Path

import numpy as np
from scipy import signal

from .metrics import decode_mono

CHECKPOINT_URL = "https://zenodo.org/record/3987831/files/Cnn14_mAP%3D0.431.pth?download=1"
CHECKPOINT_NAME = "Cnn14_mAP=0.431.pth"
CHECKPOINT_SHA256 = "0dc499e40e9761ef5ea061ffc77697697f277f6a960894903df3ada000e34b31"
MODEL_SAMPLE_RATE = 32000
WINDOW_S = 10.0
MAX_WINDOWS = 30
PRESENT = 0.10
METHOD = "panns-cnn14-0.431/windows10s/present0.10/vec128/moods7"
VECTOR_SIZE = 128
_PROJECTION: np.ndarray | None = None

# AudioSet class indices (class_labels_indices.csv, AudioSet ontology, CC BY 4.0).
SINGING = (27, 28, 29, 30, 32, 33, 34, 35, 36, 37, 254, 255)  # Singing, Choir, Yodeling, Chant, Male/Female/Child/Synthetic singing, Rapping, Humming, Vocal music, A capella
SPEECH = (0, 1, 2, 3, 5)  # Speech, Male/Female/Child speech, Narration
# AudioSet's "Music mood" classes (indices 276–282).
MOOD_CLASSES: dict[str, int] = {
    "happy": 276, "funny": 277, "sad": 278, "tender": 279, "exciting": 280, "angry": 281, "scary": 282,
}
INSTRUMENT_CLASSES: dict[str, tuple[int, ...]] = {
    "piano": (153, 154),            # Piano, Electric piano
    "guitar": (140, 141, 143, 144),  # Guitar, Electric, Acoustic, Steel/slide
    "acoustic_guitar": (143,),
    "electric_guitar": (141,),
    "bass": (142, 194),             # Bass guitar, Double bass
    "drums": (162, 163, 164, 165, 168),  # Drum kit, Drum machine, Drum, Snare, Bass drum
    "strings": (189, 190, 191, 193),     # Bowed string instrument, String section, Violin, Cello
    "violin": (191,),
    "cello": (193,),
    "brass": (185, 186, 187, 188),  # Brass instrument, French horn, Trumpet, Trombone
    "trumpet": (187,),
    "saxophone": (197,),
    "synthesizer": (158,),
    "organ": (155, 156, 157),
    "flute": (196,),
    "harp": (199,),
    "choir": (28,),
}


def model_dir() -> Path:
    return Path(os.environ.get("SYNAMP_MODEL_DIR", str(Path.home() / "panns_data")))


def checkpoint_path(download: bool = True) -> Path | None:
    """The CNN14 weights, downloaded and checked once. None when they can't be had (offline)."""
    path = model_dir() / CHECKPOINT_NAME
    if path.is_file() and _sha256(path) == CHECKPOINT_SHA256:
        return path
    if not download:
        return None
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(".part")
    try:
        with urllib.request.urlopen(CHECKPOINT_URL, timeout=60) as response, open(partial, "wb") as out:
            while chunk := response.read(1 << 20):
                out.write(chunk)
    except OSError:
        partial.unlink(missing_ok=True)
        return None
    if _sha256(partial) != CHECKPOINT_SHA256:
        partial.unlink(missing_ok=True)
        return None
    partial.replace(path)
    return path


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        while chunk := handle.read(1 << 20):
            digest.update(chunk)
    return digest.hexdigest()


_AVAILABLE: bool | None = None


def available() -> bool:
    """Can the voice stage run here (libraries installed, weights present or downloadable)?
    Decided once per process, so an offline Mac tries the download only once."""
    global _AVAILABLE
    if _AVAILABLE is None:
        try:
            import torch  # noqa: F401
            import torchlibrosa  # noqa: F401
            _AVAILABLE = checkpoint_path() is not None
        except ImportError:
            _AVAILABLE = False
    return _AVAILABLE


_MODEL = None


def _model():
    """Load CNN14 once per process (about 330 MB)."""
    global _MODEL
    if _MODEL is None:
        import torch
        torch.set_num_threads(max(1, min(2, os.cpu_count() or 1)))  # several processes share the Mac
        model = _cnn14()
        state = torch.load(str(checkpoint_path()), map_location="cpu", weights_only=False)
        model.load_state_dict(state["model"])
        model.eval()
        _MODEL = model
    return _MODEL


def _cnn14():
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torchlibrosa.stft import LogmelFilterBank, Spectrogram

    class ConvBlock(nn.Module):
        def __init__(self, in_channels: int, out_channels: int):
            super().__init__()
            self.conv1 = nn.Conv2d(in_channels, out_channels, kernel_size=(3, 3), stride=(1, 1), padding=(1, 1), bias=False)
            self.conv2 = nn.Conv2d(out_channels, out_channels, kernel_size=(3, 3), stride=(1, 1), padding=(1, 1), bias=False)
            self.bn1 = nn.BatchNorm2d(out_channels)
            self.bn2 = nn.BatchNorm2d(out_channels)

        def forward(self, x, pool_size=(2, 2)):
            x = F.relu_(self.bn1(self.conv1(x)))
            x = F.relu_(self.bn2(self.conv2(x)))
            return F.avg_pool2d(x, kernel_size=pool_size)

    class Cnn14(nn.Module):
        def __init__(self):
            super().__init__()
            self.spectrogram_extractor = Spectrogram(n_fft=1024, hop_length=320, win_length=1024, window="hann",
                                                     center=True, pad_mode="reflect", freeze_parameters=True)
            self.logmel_extractor = LogmelFilterBank(sr=MODEL_SAMPLE_RATE, n_fft=1024, n_mels=64, fmin=50, fmax=14000,
                                                     ref=1.0, amin=1e-10, top_db=None, freeze_parameters=True)
            self.bn0 = nn.BatchNorm2d(64)
            self.conv_block1 = ConvBlock(1, 64)
            self.conv_block2 = ConvBlock(64, 128)
            self.conv_block3 = ConvBlock(128, 256)
            self.conv_block4 = ConvBlock(256, 512)
            self.conv_block5 = ConvBlock(512, 1024)
            self.conv_block6 = ConvBlock(1024, 2048)
            self.fc1 = nn.Linear(2048, 2048, bias=True)
            self.fc_audioset = nn.Linear(2048, 527, bias=True)

        def forward(self, audio):
            x = self.logmel_extractor(self.spectrogram_extractor(audio))  # (batch, 1, time, mel)
            x = self.bn0(x.transpose(1, 3)).transpose(1, 3)
            for block in (self.conv_block1, self.conv_block2, self.conv_block3, self.conv_block4, self.conv_block5):
                x = block(x, pool_size=(2, 2))
            x = self.conv_block6(x, pool_size=(1, 1))
            x = torch.mean(x, dim=3)
            x = torch.max(x, dim=2)[0] + torch.mean(x, dim=2)
            embedding = F.relu_(self.fc1(x))
            return torch.sigmoid(self.fc_audioset(embedding)), embedding

    return Cnn14()


def windows(audio: np.ndarray, sample_rate: int = MODEL_SAMPLE_RATE) -> np.ndarray:
    """10-second windows (the last one padded), at most MAX_WINDOWS spread evenly across the song."""
    size = int(WINDOW_S * sample_rate)
    if audio.size == 0:
        return np.zeros((0, size), dtype=np.float32)
    starts = list(range(0, max(1, audio.size - size // 2 + 1), size)) or [0]
    if len(starts) > MAX_WINDOWS:
        starts = [starts[i] for i in np.linspace(0, len(starts) - 1, MAX_WINDOWS).astype(int)]
    out = np.zeros((len(starts), size), dtype=np.float32)
    for row, start in enumerate(starts):
        piece = audio[start:start + size]
        out[row, :piece.size] = piece
    return out


def summarise(clipwise: np.ndarray) -> dict[str, object]:
    """Per-window class probabilities (windows × 527) → the stage's fields."""
    if clipwise.size == 0:
        return {"vocal_fraction": None, "instrumental": None, "instruments": {}, "moods": {}, "voice_peak": None}
    voice = np.maximum(clipwise[:, SINGING].max(axis=1), clipwise[:, SPEECH].max(axis=1))
    vocal_fraction = float(np.mean(voice > PRESENT))
    instruments = {name: float(np.mean(clipwise[:, list(indices)].max(axis=1) > PRESENT))
                   for name, indices in INSTRUMENT_CLASSES.items()}
    moods = {name: round(float(np.mean(clipwise[:, index])), 4) for name, index in MOOD_CLASSES.items()}
    return {"vocal_fraction": vocal_fraction, "instrumental": 1.0 - vocal_fraction,
            "instruments": instruments, "moods": moods, "voice_peak": float(voice.max())}


def _infer(batch: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """CNN14 on a batch of windows → (windows × 527) probabilities and (windows × 2048) embeddings."""
    import torch
    with torch.no_grad():
        clipwise, embedding = _model()(torch.from_numpy(batch))
        return clipwise.numpy(), embedding.numpy()


def _projection() -> np.ndarray:
    """A fixed 2048 → 128 random projection. Never change the seed: stored vectors depend on it."""
    global _PROJECTION
    if _PROJECTION is None:
        rng = np.random.default_rng(20261008)
        _PROJECTION = (rng.standard_normal((2048, VECTOR_SIZE)) / np.sqrt(VECTOR_SIZE)).astype(np.float32)
    return _PROJECTION


def sound_vector(embeddings: np.ndarray) -> str | None:
    """Windows × 2048 → the song's 128-byte sound vector (base64 of signed bytes), or None."""
    import base64
    if embeddings.size == 0:
        return None
    vector = embeddings.mean(axis=0) @ _projection()
    norm = float(np.linalg.norm(vector))
    if not norm:
        return None
    quantised = np.clip(np.round(vector / norm * 127 * 4), -127, 127).astype(np.int8)  # ×4: unit vectors' parts are small
    return base64.b64encode(quantised.tobytes()).decode("ascii")


def extract_voice(path: Path) -> dict[str, object]:
    """Run the voice stage for one file."""
    mono, sample_rate = decode_mono(path)
    divisor = np.gcd(sample_rate, MODEL_SAMPLE_RATE)
    audio = signal.resample_poly(mono, MODEL_SAMPLE_RATE // divisor, sample_rate // divisor).astype(np.float32)
    batch = windows(audio)
    if not len(batch):
        return {**summarise(np.zeros((0, 527))), "voice_method": METHOD, "voice_windows": 0, "sound_vector": None}
    clipwise, embeddings = _infer(batch)
    return {**summarise(clipwise), "voice_method": METHOD, "voice_windows": int(len(batch)),
            "sound_vector": sound_vector(embeddings)}
