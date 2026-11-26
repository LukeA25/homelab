#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# dependencies = ["caldav>=3.7,<4", "python-dotenv>=1.0,<2"]
# ///
"""Verify iCloud calendar discovery using Nova's private engine environment."""

import argparse
import logging
from pathlib import Path

from caldav import DAVClient
from caldav.lib.error import AuthorizationError
from dotenv import dotenv_values

ICLOUD_URL = "https://caldav.icloud.com/"
ENGINE_ENV = Path(__file__).resolve().parents[1] / "compose/nova-engine/.env"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ENGINE_ENV)
    parser.add_argument("--show-names", action="store_true", help="Print calendar names for local review")
    args = parser.parse_args()
    if not args.env_file.is_file():
        parser.exit(1, "Create the private engine .env file before checking CalDAV.\n")
    config = dotenv_values(args.env_file, interpolate=False)
    username = config.get("ICLOUD_CALDAV_USERNAME")
    password = config.get("ICLOUD_CALDAV_APP_PASSWORD")
    if not username or not password:
        parser.exit(1, "Fill in ICLOUD_CALDAV_USERNAME and ICLOUD_CALDAV_APP_PASSWORD in the engine .env.\n")

    # Discovery diagnostics from the library can contain private CalDAV URLs.
    logging.disable(logging.CRITICAL)
    try:
        with DAVClient(url=ICLOUD_URL, username=username, password=password, timeout=15) as client:
            calendars = client.principal().calendars()
            names = [calendar.get_display_name() for calendar in calendars] if args.show_names else []
    except AuthorizationError:
        parser.exit(1, "iCloud rejected authentication. Check the Apple Account email and app-specific password.\n")
    except Exception:
        parser.exit(1, "iCloud discovery failed. Check outbound HTTPS and iCloud Calendar availability.\n")

    if not calendars:
        parser.exit(1, "iCloud returned no calendars. Verify that the calendars are stored in iCloud.\n")
    print(f"Found {len(calendars)} iCloud calendar(s).")
    for name in names:
        print(f"- {name!r}")


if __name__ == "__main__":
    main()
