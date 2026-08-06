#!/usr/bin/env python3
"""Build close-mic metal-token-on-wood alternatives for review round 4."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import soundfile as sf


SAMPLE_RATE = 44_100


def load(path: Path) -> np.ndarray:
    sound, sample_rate = sf.read(path, always_2d=True, dtype="float32")
    if sound.shape[1] == 1:
        sound = np.repeat(sound, 2, axis=1)
    if sample_rate != SAMPLE_RATE:
        old = np.linspace(0, 1, len(sound), endpoint=False)
        new = np.linspace(0, 1, round(len(sound) * SAMPLE_RATE / sample_rate), endpoint=False)
        sound = np.column_stack([np.interp(new, old, sound[:, channel]) for channel in range(2)]).astype(np.float32)
    return sound


def cut(sound: np.ndarray, center: float, before: float, duration: float) -> np.ndarray:
    start = max(0, round((center - before) * SAMPLE_RATE))
    stop = min(len(sound), start + round(duration * SAMPLE_RATE))
    return sound[start:stop].copy()


def soften(sound: np.ndarray, window: int) -> np.ndarray:
    if window <= 1:
        return sound.copy()
    kernel = np.ones(window, dtype=np.float32) / window
    return np.column_stack([np.convolve(sound[:, channel], kernel, mode="same") for channel in range(2)])


def polish(sound: np.ndarray, peak: float, lowpass_window: int = 3) -> np.ndarray:
    result = soften(sound - np.mean(sound, axis=0, keepdims=True), lowpass_window)
    result = np.tanh(result * 1.35) / np.tanh(1.35)
    fade_in = min(len(result), round(0.004 * SAMPLE_RATE))
    fade_out = min(len(result), round(0.085 * SAMPLE_RATE))
    result[:fade_in] *= np.linspace(0, 1, fade_in, dtype=np.float32)[:, None]
    result[-fade_out:] *= np.linspace(1, 0, fade_out, dtype=np.float32)[:, None]
    current = float(np.max(np.abs(result)))
    return result if current == 0 else result * (peak / current)


def mix(layers: list[tuple[np.ndarray, float, float]]) -> np.ndarray:
    length = max(round(offset * SAMPLE_RATE) + len(sound) for sound, offset, _ in layers)
    result = np.zeros((length, 2), dtype=np.float32)
    for sound, offset, gain in layers:
        start = round(offset * SAMPLE_RATE)
        result[start : start + len(sound)] += sound * gain
    return result


def preview(variants: list[np.ndarray], peak: float) -> np.ndarray:
    sequence = [variants[0], variants[1], variants[2], variants[3], variants[1], variants[0]]
    return polish(mix([(sound, index * 0.255, 0.92) for index, sound in enumerate(sequence)]), peak, 1)


def write(path: Path, sound: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, sound, SAMPLE_RATE, subtype="PCM_16")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--coins", type=Path, required=True, help="CC0 coins recorded on a wooden table")
    parser.add_argument("--scratch", type=Path, required=True, help="CC0 coin scratch on a wood veneer desk")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    coins = load(args.coins)
    scratch = load(args.scratch)

    soft_times = [0.42, 1.26, 3.72, 5.06]
    crisp_times = [1.74, 2.82, 12.74, 15.28]
    scratch_times = [0.75, 1.55, 2.65, 4.15]

    soft = [polish(cut(coins, moment, 0.042, 0.34), 0.48, 9) for moment in soft_times]
    crisp = [polish(cut(coins, moment, 0.032, 0.31), 0.56, 4) for moment in crisp_times]
    slide = []
    for coin_time, scratch_time in zip(soft_times, scratch_times):
        contact = polish(cut(coins, coin_time, 0.038, 0.25), 0.42, 8)
        texture = polish(cut(scratch, scratch_time, 0.025, 0.21), 0.22, 13)
        slide.append(polish(mix([(contact, 0, 0.88), (texture, 0.055, 0.46)]), 0.51, 5))

    families = {
        "soft": (soft, 0.54),
        "slide": (slide, 0.57),
        "crisp": (crisp, 0.60),
    }
    for family, (variants, preview_peak) in families.items():
        for index, variant in enumerate(variants, start=1):
            write(args.output / f"token-step-metal-{family}-{index}.wav", variant)
        write(args.output / f"token-preview-metal-{family}.wav", preview(variants, preview_peak))


if __name__ == "__main__":
    main()
