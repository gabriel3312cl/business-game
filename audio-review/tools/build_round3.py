#!/usr/bin/env python3
"""Build playful token-movement alternatives for audio-review round 3."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import soundfile as sf

import build_round2 as audio


def chirp(start_hz: float, end_hz: float, duration: float, volume: float = 0.18) -> np.ndarray:
    count = round(duration * audio.SAMPLE_RATE)
    time = np.arange(count, dtype=np.float32) / audio.SAMPLE_RATE
    progress = np.linspace(0, 1, count, dtype=np.float32)
    frequencies = start_hz * np.power(end_hz / start_hz, progress)
    phase = 2 * np.pi * np.cumsum(frequencies) / audio.SAMPLE_RATE
    envelope = np.clip(np.sin(np.pi * progress), 0, None) ** 0.65 * np.exp(-2.2 * progress)
    mono = np.sin(phase) * envelope * volume
    return np.column_stack([mono, mono])


def click(duration: float, seed: int, volume: float = 0.12, softness: int = 12) -> np.ndarray:
    count = round(duration * audio.SAMPLE_RATE)
    rng = np.random.default_rng(seed)
    raw = rng.normal(0, 1, count + softness).astype(np.float32)
    smoothed = np.convolve(raw, np.ones(softness, dtype=np.float32) / softness, mode="valid")[:count]
    envelope = np.exp(-38 * np.arange(count, dtype=np.float32) / audio.SAMPLE_RATE)
    mono = smoothed * envelope * volume
    return np.column_stack([mono, mono])


def cork(token: np.ndarray, pitch: float) -> np.ndarray:
    return audio.mix(
        (audio.gain(token, 0.5), 0),
        (audio.tone(310 * pitch, 0.11, 0.13, "triangle"), 0.005),
        (click(0.075, round(100 * pitch), 0.09, 22), 0),
        (audio.tone(465 * pitch, 0.07, 0.07, "triangle"), 0.052),
    )


def marble(_: np.ndarray, pitch: float) -> np.ndarray:
    return audio.mix(
        (click(0.055, round(200 * pitch), 0.055, 5), 0),
        (audio.tone(1_320 * pitch, 0.19, 0.14), 0),
        (audio.tone(2_045 * pitch, 0.14, 0.07), 0.004),
        (audio.tone(1_710 * pitch, 0.09, 0.055), 0.105),
    )


def bubble(_: np.ndarray, pitch: float) -> np.ndarray:
    return audio.mix(
        (chirp(235 * pitch, 690 * pitch, 0.145, 0.17), 0),
        (audio.tone(820 * pitch, 0.09, 0.065, "triangle"), 0.105),
        (click(0.035, round(300 * pitch), 0.045, 18), 0.12),
    )


def clockwork(_: np.ndarray, pitch: float) -> np.ndarray:
    return audio.mix(
        (click(0.05, round(400 * pitch), 0.095, 4), 0),
        (click(0.045, round(410 * pitch), 0.07, 6), 0.038),
        (audio.tone(760 * pitch, 0.085, 0.07, "triangle"), 0.01),
        (audio.tone(1_140 * pitch, 0.115, 0.1, "triangle"), 0.065),
    )


def tiptoe(_: np.ndarray, pitch: float) -> np.ndarray:
    return audio.mix(
        (audio.tone(215 * pitch, 0.09, 0.095, "triangle"), 0),
        (click(0.055, round(500 * pitch), 0.06, 24), 0.008),
        (audio.tone(355 * pitch, 0.115, 0.1, "triangle"), 0.09),
        (click(0.045, round(510 * pitch), 0.045, 20), 0.095),
    )


def write(path: Path, sound: np.ndarray, peak: float = 0.72) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, audio.normalize(audio.fade(sound), peak), audio.SAMPLE_RATE, subtype="PCM_16")


def preview(builder, token: np.ndarray) -> np.ndarray:
    pitches = [0.96, 1.02, 0.99, 1.06, 1.01, 1.12]
    return audio.mix(*[(audio.gain(builder(token, pitch), 0.82), index * 0.235) for index, pitch in enumerate(pitches)])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--approved", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    token = audio.trim(audio.read(args.approved / "token-step-a.ogg"))
    alternatives = {
        "cork": cork,
        "marble": marble,
        "bubble": bubble,
        "clockwork": clockwork,
        "tiptoe": tiptoe,
    }

    for name, builder in alternatives.items():
        write(args.output / f"token-step-{name}.wav", builder(token, 1.0))
        write(args.output / f"token-preview-{name}.wav", preview(builder, token), peak=0.76)


if __name__ == "__main__":
    main()
