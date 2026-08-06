#!/usr/bin/env python3
"""Export only user-approved review sounds as browser-ready Ogg assets."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
import soundfile as sf


CATALOG_ENTRY = re.compile(r"\{ id: '([^']+)'.*?file: '([^']+)'")
SELECTED_TOKEN_ID = "token-step-metal-soft"
SAMPLE_RATE = 44_100


def convert(source: Path, destination: Path) -> None:
    sound, sample_rate = sf.read(source, always_2d=True, dtype="float32")
    if sound.shape[1] == 1:
        sound = np.repeat(sound, 2, axis=1)
    if sample_rate != SAMPLE_RATE:
        old = np.linspace(0, 1, len(sound), endpoint=False)
        new = np.linspace(0, 1, round(len(sound) * SAMPLE_RATE / sample_rate), endpoint=False)
        sound = np.column_stack(
            [np.interp(new, old, sound[:, channel]) for channel in range(2)]
        ).astype(np.float32)
    destination.parent.mkdir(parents=True, exist_ok=True)
    sf.write(
        destination,
        sound,
        SAMPLE_RATE,
        format="OGG",
        subtype="VORBIS",
        compression_level=0.72,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--feedback", type=Path, required=True)
    parser.add_argument("--review-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    decisions = json.loads(args.feedback.read_text())
    approved = {item["id"] for item in decisions if item["vote"] == "approved"}
    if len(approved) != 48 or SELECTED_TOKEN_ID not in approved:
        raise ValueError("expected 48 approved sounds including the soft metal token")

    catalog = {
        sound_id: file_name
        for sound_id, file_name in CATALOG_ENTRY.findall(
            (args.review_root / "catalog.js").read_text()
        )
    }
    missing = approved - catalog.keys()
    if missing:
        raise ValueError(f"approved sounds missing from catalog: {sorted(missing)}")

    exported = 0
    for sound_id in sorted(approved - {SELECTED_TOKEN_ID}):
        convert(args.review_root / catalog[sound_id], args.output / f"{sound_id}.ogg")
        exported += 1

    for variant in range(1, 5):
        convert(
            args.review_root / f"sfx-v4/token-step-metal-soft-{variant}.wav",
            args.output / f"token-step-metal-soft-{variant}.ogg",
        )
        exported += 1

    if exported != 51:
        raise ValueError(f"expected 51 runtime assets, exported {exported}")


if __name__ == "__main__":
    main()
