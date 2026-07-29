"""Generate neutral demo content. It contains no Monopoly or Richup names/assets."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "content" / "packs"


def tile_for(index: int, side_length: int) -> dict:
    side_span = side_length - 1
    corners = {
        0: ("start", {}),
        side_span: ("jail", {}),
        side_span * 2: ("free", {}),
        side_span * 3: ("go_to_jail", {}),
    }
    if index in corners:
        kind, extra = corners[index]
    elif index % 10 == 4:
        kind, extra = "tax", {"amount": 100 + index}
    elif index % 8 == 0:
        kind, extra = "card", {
            "deck_id": "opportunity" if (index // 8) % 2 else "community"
        }
    elif index % 10 == 5:
        kind, extra = "transport", {
            "price": 200,
            "base_rent": 25,
            "mortgage_value": 100,
            "rent_levels": [25, 50, 100, 200, 400, 800],
        }
    elif index % 14 == 0:
        kind, extra = "utility", {
            "price": 150,
            "base_rent": 20,
            "mortgage_value": 75,
            "rent_multipliers": [4, 10, 15, 20],
        }
    else:
        price = 60 + index * 10
        base_rent = 4 + index * 2
        kind, extra = "property", {
            "group": f"group_{(index // 3) % 8 + 1}",
            "color": [
                "#7c4dff",
                "#26c6da",
                "#ec407a",
                "#ff7043",
                "#ffee58",
                "#66bb6a",
                "#42a5f5",
                "#ab47bc",
            ][(index // 3) % 8],
            "price": price,
            "base_rent": base_rent,
            "mortgage_value": price // 2,
            "build_cost": 50 + ((index // 3) % 4) * 25,
            "rent_levels": [
                base_rent,
                base_rent * 5,
                base_rent * 15,
                base_rent * 45,
                base_rent * 80,
                base_rent * 125,
            ],
        }
    return {
        "id": f"{kind}_{index:02d}" if kind != "property" else f"property_{index:02d}",
        "kind": kind,
        "name_key": f"tile.{index:02d}.name",
        **extra,
    }


def generate(
    pack_id: str,
    mode: str,
    side_length: int,
    names: tuple[str, str],
) -> None:
    pack_dir = ROOT / pack_id
    (pack_dir / "locales").mkdir(parents=True, exist_ok=True)
    count = side_length * 4 - 4
    tiles = [tile_for(index, side_length) for index in range(count)]
    decks = [
        {
            "id": "opportunity",
            "cards": [
                {
                    "id": "opportunity_bonus",
                    "message_key": "card.opportunity_bonus",
                    "effect": {"type": "cash", "amount": 100},
                },
                {
                    "id": "opportunity_fee",
                    "message_key": "card.opportunity_fee",
                    "effect": {"type": "cash", "amount": -50},
                },
                {
                    "id": "opportunity_start",
                    "message_key": "card.opportunity_start",
                    "effect": {
                        "type": "move_to",
                        "tile_id": "start_00",
                        "collect_start": True,
                    },
                },
                {
                    "id": "opportunity_nearest_transport",
                    "message_key": "card.opportunity_nearest_transport",
                    "effect": {
                        "type": "move_to_nearest",
                        "tile_kind": "transport",
                        "collect_start": True,
                        "rent_multiplier": 2,
                    },
                },
                {
                    "id": "opportunity_nearest_utility",
                    "message_key": "card.opportunity_nearest_utility",
                    "effect": {
                        "type": "move_to_nearest",
                        "tile_kind": "utility",
                        "collect_start": True,
                        "dice_multiplier": 10,
                    },
                },
                {
                    "id": "opportunity_back",
                    "message_key": "card.opportunity_back",
                    "effect": {
                        "type": "move_relative",
                        "steps": -3,
                    },
                },
                {
                    "id": "opportunity_jail",
                    "message_key": "card.opportunity_jail",
                    "effect": {"type": "go_to_jail"},
                },
                {
                    "id": "opportunity_jail_free",
                    "message_key": "card.opportunity_jail_free",
                    "effect": {"type": "get_out_of_jail"},
                },
            ],
        },
        {
            "id": "community",
            "cards": [
                {
                    "id": "community_bonus",
                    "message_key": "card.community_bonus",
                    "effect": {"type": "cash", "amount": 50},
                },
                {
                    "id": "community_repairs",
                    "message_key": "card.community_repairs",
                    "effect": {
                        "type": "repairs",
                        "house_amount": 40,
                        "hotel_amount": 115,
                    },
                },
                {
                    "id": "community_collect_each",
                    "message_key": "card.community_collect_each",
                    "effect": {"type": "cash_each", "amount": 10},
                },
                {
                    "id": "community_pay_each",
                    "message_key": "card.community_pay_each",
                    "effect": {"type": "cash_each", "amount": -20},
                },
                {
                    "id": "community_move",
                    "message_key": "card.community_move",
                    "effect": {
                        "type": "move_to",
                        "tile_id": "property_03",
                        "collect_start": True,
                    },
                },
                {
                    "id": "community_jail_free",
                    "message_key": "card.community_jail_free",
                    "effect": {"type": "get_out_of_jail"},
                },
            ],
        },
    ]
    manifest = {
        "schema_version": 4,
        "id": pack_id,
        "version": "1.3.0",
        "name_key": "pack.name",
        "board_mode": mode,
        "side_length": side_length,
        "tile_count": count,
        "default_locale": "es",
        "locales": ["es", "en"],
        "min_players": 2,
        "max_players": 8 if mode == "extended" else 6,
        "starting_balance": 1500,
        "pass_start_salary": 200,
        "mortgage_interest_percent": 10,
        "building_sell_percent": 50,
        "monopoly_rent_multiplier": 2,
        "jail_fine": 50,
        "jail_max_failed_rolls": 3,
        "max_consecutive_doubles": 3,
        "house_supply": 32,
        "hotel_supply": 12,
        "default_rules": {
            "auction_unpurchased_properties": True,
            "free_parking_jackpot": False,
            "double_salary_on_start": False,
        },
        "configurable_rules": [
            "auction_unpurchased_properties",
            "free_parking_jackpot",
            "double_salary_on_start",
        ],
    }
    locales = {
        "es": {
            "pack.name": names[0],
            **{f"tile.{i:02d}.name": f"Casilla {i}" for i in range(count)},
            "card.opportunity_bonus": "Un proyecto resultó bien. Recibe $100.",
            "card.opportunity_fee": "Paga $50 por gastos administrativos.",
            "card.opportunity_start": "Avanza hasta la salida.",
            "card.opportunity_nearest_transport": (
                "Avanza al transporte más cercano. Si tiene dueño, paga renta doble."
            ),
            "card.opportunity_nearest_utility": (
                "Avanza al servicio más cercano. Si tiene dueño, lanza los dados "
                "y paga diez veces el resultado."
            ),
            "card.opportunity_back": "Retrocede tres casillas.",
            "card.opportunity_jail": "Ve directamente a detención.",
            "card.opportunity_jail_free": "Conserva esta carta para salir de detención.",
            "card.community_bonus": "Recibes un dividendo de $50.",
            "card.community_repairs": (
                "Paga $40 por cada casa y $115 por cada hotel."
            ),
            "card.community_collect_each": "Recibe $10 de cada jugador.",
            "card.community_pay_each": "Paga $20 a cada jugador.",
            "card.community_move": "Avanza hasta la casilla 3.",
            "card.community_jail_free": "Conserva esta carta para salir de detención.",
        },
        "en": {
            "pack.name": names[1],
            **{f"tile.{i:02d}.name": f"Space {i}" for i in range(count)},
            "card.opportunity_bonus": "A project paid off. Collect $100.",
            "card.opportunity_fee": "Pay $50 in administrative costs.",
            "card.opportunity_start": "Advance to start.",
            "card.opportunity_nearest_transport": (
                "Advance to the nearest transport. If owned, pay double rent."
            ),
            "card.opportunity_nearest_utility": (
                "Advance to the nearest utility. If owned, roll the dice and pay "
                "ten times the result."
            ),
            "card.opportunity_back": "Move back three spaces.",
            "card.opportunity_jail": "Go directly to holding.",
            "card.opportunity_jail_free": "Keep this card to leave holding.",
            "card.community_bonus": "Collect a $50 dividend.",
            "card.community_repairs": (
                "Pay $40 for each house and $115 for each hotel."
            ),
            "card.community_collect_each": "Collect $10 from every player.",
            "card.community_pay_each": "Pay every player $20.",
            "card.community_move": "Advance to space 3.",
            "card.community_jail_free": "Keep this card to leave holding.",
        },
    }
    side_span = side_length - 1
    special_names = {
        "es": {
            0: "Salida",
            side_span: "Visita",
            side_span * 2: "Descanso",
            side_span * 3: "Ir a detención",
        },
        "en": {
            0: "Start",
            side_span: "Visiting",
            side_span * 2: "Rest",
            side_span * 3: "Go to holding",
        },
    }
    for locale, replacements in special_names.items():
        for index, value in replacements.items():
            if index < count:
                locales[locale][f"tile.{index:02d}.name"] = value

    (pack_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    )
    (pack_dir / "board.json").write_text(
        json.dumps({"tiles": tiles, "decks": decks}, ensure_ascii=False, indent=2)
        + "\n"
    )
    for locale, messages in locales.items():
        (pack_dir / "locales" / f"{locale}.json").write_text(
            json.dumps(messages, ensure_ascii=False, indent=2) + "\n"
        )


if __name__ == "__main__":
    generate("classic-demo", "classic", 11, ("Ciudad Clásica", "Classic City"))
    generate("extended-demo", "extended", 17, ("Mundo Extendido", "Extended World"))
