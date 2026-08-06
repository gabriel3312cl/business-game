#!/usr/bin/env python3
"""Build the second audio-review round from licensed source recordings."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import soundfile as sf


SAMPLE_RATE = 44_100


def read(path: Path, start: float = 0, duration: float | None = None) -> np.ndarray:
    audio, sample_rate = sf.read(path, always_2d=True, dtype="float32")
    if sample_rate != SAMPLE_RATE:
        raise ValueError(f"{path} uses {sample_rate} Hz, expected {SAMPLE_RATE} Hz")
    begin = max(0, round(start * SAMPLE_RATE))
    end = None if duration is None else begin + round(duration * SAMPLE_RATE)
    return audio[begin:end]


def trim(audio: np.ndarray, threshold: float = 0.006, padding: float = 0.025) -> np.ndarray:
    active = np.flatnonzero(np.max(np.abs(audio), axis=1) >= threshold)
    if len(active) == 0:
        return audio
    pad = round(padding * SAMPLE_RATE)
    return audio[max(0, active[0] - pad) : min(len(audio), active[-1] + pad + 1)]


def clip(audio: np.ndarray, duration: float) -> np.ndarray:
    return audio[: round(duration * SAMPLE_RATE)]


def gain(audio: np.ndarray, amount: float) -> np.ndarray:
    return audio * amount


def fade(audio: np.ndarray, fade_in: float = 0.008, fade_out: float = 0.06) -> np.ndarray:
    result = audio.copy()
    in_samples = min(len(result), round(fade_in * SAMPLE_RATE))
    out_samples = min(len(result), round(fade_out * SAMPLE_RATE))
    if in_samples:
        result[:in_samples] *= np.linspace(0, 1, in_samples, dtype=np.float32)[:, None]
    if out_samples:
        result[-out_samples:] *= np.linspace(1, 0, out_samples, dtype=np.float32)[:, None]
    return result


def normalize(audio: np.ndarray, peak: float = 0.88) -> np.ndarray:
    current = float(np.max(np.abs(audio))) if len(audio) else 0
    return audio if current == 0 else audio * (peak / current)


def mix(*layers: tuple[np.ndarray, float], duration: float | None = None) -> np.ndarray:
    end = max((round(offset * SAMPLE_RATE) + len(audio) for audio, offset in layers), default=1)
    if duration is not None:
        end = max(end, round(duration * SAMPLE_RATE))
    output = np.zeros((end, 2), dtype=np.float32)
    for audio, offset in layers:
        start = round(offset * SAMPLE_RATE)
        stop = min(end, start + len(audio))
        if stop > start:
            output[start:stop] += audio[: stop - start]
    return normalize(fade(output))


def delay(audio: np.ndarray, seconds: float = 0.09, decay: float = 0.28, repeats: int = 3) -> np.ndarray:
    layers = [(audio, 0.0)]
    for repeat in range(1, repeats + 1):
        layers.append((gain(audio, decay**repeat), seconds * repeat))
    return mix(*layers)


def tone(frequency: float, duration: float, volume: float = 0.25, kind: str = "sine") -> np.ndarray:
    count = round(duration * SAMPLE_RATE)
    time = np.arange(count, dtype=np.float32) / SAMPLE_RATE
    phase = 2 * np.pi * frequency * time
    if kind == "triangle":
        wave = 2 / np.pi * np.arcsin(np.sin(phase))
    elif kind == "soft-square":
        wave = np.tanh(2.4 * np.sin(phase))
    else:
        wave = np.sin(phase)
    envelope = np.exp(-4.5 * time / max(duration, 0.001))
    envelope *= np.minimum(1, time / 0.008)
    mono = (wave * envelope * volume).astype(np.float32)
    return np.column_stack([mono, mono])


def sweep(start_hz: float, end_hz: float, duration: float, volume: float = 0.22) -> np.ndarray:
    count = round(duration * SAMPLE_RATE)
    frequencies = np.linspace(start_hz, end_hz, count, dtype=np.float32)
    phase = 2 * np.pi * np.cumsum(frequencies) / SAMPLE_RATE
    envelope = np.clip(
        np.sin(np.linspace(0, np.pi, count, dtype=np.float32)),
        0,
        None,
    ) ** 1.5
    mono = np.sin(phase) * envelope * volume
    return np.column_stack([mono, mono])


def noise_scrape(duration: float = 0.65) -> np.ndarray:
    rng = np.random.default_rng(4174)
    count = round(duration * SAMPLE_RATE)
    raw = rng.normal(0, 1, count).astype(np.float32)
    smoothed = np.convolve(raw, np.ones(36, dtype=np.float32) / 36, mode="same")
    wobble = 0.55 + 0.45 * np.sin(np.linspace(0, 9 * np.pi, count, dtype=np.float32)) ** 2
    envelope = np.sin(np.linspace(0, np.pi, count, dtype=np.float32))
    mono = smoothed * wobble * envelope * 0.34
    return np.column_stack([mono, mono])


def chime(notes: list[float], spacing: float = 0.12, duration: float = 0.38, volume: float = 0.23) -> np.ndarray:
    return mix(*[(tone(note, duration, volume, "triangle"), index * spacing) for index, note in enumerate(notes)])


def write(output_dir: Path, name: str, audio: np.ndarray) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    sf.write(output_dir / f"{name}.wav", normalize(audio), SAMPLE_RATE, subtype="PCM_16")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument("--approved", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    source = lambda name: trim(read(args.sources / name))
    approved = lambda name: trim(read(args.approved / name))

    coins = source("1993.wav")
    coin_magic = source("1936.wav")
    money_bag = source("1989.wav")
    atm = source("2841.wav")
    hammer_metal = source("833.wav")
    hammer_wood = source("830.wav")
    saw = source("821.wav")
    drill = source("855.wav")
    construction_done = source("811.wav")
    prison_door = source("201.wav")
    door_key = source("2842.wav")
    door_slam = source("194.wav")
    announce = source("2861.wav")
    success = source("2865.wav")
    dial_error = source("2871.wav")
    crowd_cheer = source("462.wav")
    crowd_sad = source("469.wav")
    fail_piano = source("473.wav")
    glitch = source("2594.wav")
    tech_notice = source("3123.wav")
    happy_bells = source("937.wav")
    wave_alarm = source("987.wav")
    countdown = source("916.wav")
    natural_dice = source("dice-natural.flac")
    old_dice = approved("dice-doubles.ogg")
    token = approved("token-step-a.ogg")

    cash_register = mix(
        (clip(atm, 0.55), 0.0),
        (gain(money_bag, 0.65), 0.14),
        (gain(coins, 0.85), 0.28),
        (tone(1_318.5, 0.55, 0.27, "triangle"), 0.72),
    )
    cash_happy = mix(
        (coins, 0.0),
        (gain(coin_magic, 0.8), 0.18),
        (chime([659.3, 830.6, 1046.5], 0.1, 0.34), 0.25),
    )
    cash_down = mix(
        (gain(money_bag, 0.75), 0.0),
        (gain(coins, 0.55), 0.13),
        (chime([523.3, 392.0, 293.7], 0.12, 0.3, 0.18), 0.22),
    )

    write(args.output, "dice-roll-a", mix((old_dice, 0.0), (natural_dice, 0.55), (gain(natural_dice, 0.55), 1.05), duration=2.15))
    write(args.output, "dice-roll-b", mix((gain(old_dice, 0.8), 0.0), (natural_dice, 0.42), (gain(token, 0.65), 1.35), duration=1.85))
    write(args.output, "token-step-b", mix((gain(token, 0.8), 0.0), (tone(720, 0.12, 0.12, "triangle"), 0.02)))

    write(args.output, "property-purchase", mix((cash_register, 0.0), (success, 0.72)))
    write(args.output, "payment-sent", cash_down)
    write(args.output, "payment-received", cash_happy)
    write(args.output, "salary-collected", mix((cash_happy, 0.0), (chime([784, 988, 1175, 1568], 0.09, 0.32), 0.45)))
    write(args.output, "building-house", mix((clip(saw, 0.68), 0.0), (hammer_wood, 0.48), (hammer_wood, 0.86), (chime([659, 880], 0.1, 0.28), 1.18)))
    write(args.output, "building-hotel", mix((clip(drill, 1.15), 0.0), (hammer_metal, 0.82), (hammer_wood, 1.22), (construction_done, 1.48)))
    write(args.output, "building-sold", mix((hammer_wood, 0.0), (cash_register, 0.24), (chime([659, 988], 0.1, 0.3), 0.8)))
    write(args.output, "property-mortgaged", mix((clip(atm, 0.6), 0.0), (door_key, 0.22), (chime([392, 311, 247], 0.13, 0.38, 0.17), 0.72)))
    write(args.output, "property-unmortgaged", mix((door_key, 0.0), (cash_happy, 0.44), (clip(happy_bells, 1.25), 0.7)))

    auction_gavel = delay(hammer_wood, 0.07, 0.16, 2)
    write(args.output, "auction-start", mix((auction_gavel, 0.0), (auction_gavel, 0.72), (clip(announce, 1.0), 1.15)))
    write(args.output, "auction-bid", mix((coins, 0.0), (tone(1046.5, 0.24, 0.2, "triangle"), 0.08)))
    write(args.output, "auction-countdown", mix((clip(countdown, 2.8), 0.0), (wave_alarm, 1.85), duration=3.0))
    write(args.output, "auction-completed", mix((auction_gavel, 0.0), (clip(crowd_cheer, 2.2), 0.38), (success, 0.55)))
    write(args.output, "auction-lost", mix((auction_gavel, 0.0), (clip(fail_piano, 1.8), 0.3), (chime([330, 262], 0.18, 0.4, 0.15), 0.9)))

    write(args.output, "trade-accepted", mix((success, 0.0), (clip(crowd_cheer, 1.45), 0.18), (chime([659, 784, 988], 0.1, 0.3), 0.35)))
    write(args.output, "trade-rejected", mix((clip(fail_piano, 1.65), 0.0), (tone(155, 0.45, 0.18, "soft-square"), 0.28)))
    write(args.output, "trade-cancelled", mix((sweep(620, 170, 0.42, 0.18), 0.0), (gain(door_slam, 0.6), 0.2)))

    write(args.output, "jail-entered", mix((prison_door, 0.0), (delay(hammer_metal, 0.11, 0.38, 4), 0.35), (tone(98, 1.4, 0.13), 0.3)))
    write(args.output, "jail-roll-failed", mix((clip(fail_piano, 1.8), 0.0), (delay(hammer_metal, 0.09, 0.22, 2), 1.05)))
    write(args.output, "tax-or-repairs", mix((cash_down, 0.0), (clip(fail_piano, 1.5), 0.45), (tone(130.8, 0.5, 0.16, "soft-square"), 0.72)))
    write(args.output, "debt-created", mix((clip(atm, 0.55), 0.0), (coins, 0.18), (clip(countdown, 1.8), 0.65), (tone(220, 1.1, 0.12), 0.72)))
    write(args.output, "debt-paid", mix((cash_register, 0.0), (success, 0.65)))

    write(args.output, "player-bankrupt", mix((clip(fail_piano, 1.9), 0.0), (clip(crowd_sad, 1.7), 0.36), (sweep(240, 82, 1.25, 0.13), 0.4)))
    write(args.output, "game-finished", mix((chime([784, 659, 523, 392], 0.28, 0.62, 0.2), 0.0), (gain(door_slam, 0.28), 1.45), duration=2.6))
    write(args.output, "action-rejected", mix((clip(dial_error, 0.55), 0.0), (tone(145, 0.48, 0.2, "soft-square"), 0.08)))
    write(args.output, "connection-lost", mix((glitch, 0.0), (sweep(760, 90, 0.8, 0.2), 0.25), (tone(110, 0.5, 0.14), 0.62)))
    write(args.output, "ui-important-click", mix((clip(announce, 1.35), 0.0), (chime([523.3, 784], 0.18, 0.45, 0.2), 0.1)))
    write(args.output, "player-joined", mix((noise_scrape(0.62), 0.0), (gain(hammer_wood, 0.28), 0.48), (chime([523, 659], 0.1, 0.25, 0.15), 0.62)))
    write(args.output, "player-left", mix((gain(door_slam, 0.85), 0.0), (chime([440, 330], 0.14, 0.32, 0.12), 0.42)))

    write(args.output, "chat-message", mix((tech_notice, 0.0), (chime([988, 1319], 0.1, 0.27, 0.14), 0.12)))
    write(args.output, "chat-mention", mix((clip(happy_bells, 1.15), 0.0), (chime([1175, 1568, 1319], 0.08, 0.24, 0.16), 0.08)))
    write(args.output, "advisor-response", mix((sweep(380, 1_900, 0.62, 0.13), 0.0), (tech_notice, 0.26), (chime([659, 988, 1480], 0.1, 0.35, 0.14), 0.58)))


if __name__ == "__main__":
    main()
