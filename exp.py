import requests
import json
import csv
from datetime import datetime

BASE_URL = "https://eonet.gsfc.nasa.gov/api/v3"


class EONETClient:
    def __init__(self, base_url=BASE_URL, timeout=30):
        self.base_url = base_url
        self.timeout = timeout

    def _get(self, endpoint, params=None):
        url = f"{self.base_url}/{endpoint}"
        response = requests.get(url, params=params, timeout=self.timeout)
        response.raise_for_status()
        return response.json()

    def get_categories(self):
        return self._get("categories")

    def get_sources(self):
        return self._get("sources")

    def get_events(self, limit=50, days=30, status="open"):
        params = {
            "limit": limit,
            "days": days,
            "status": status
        }
        return self._get("events", params=params)

    def get_event_by_id(self, event_id):
        return self._get(f"events/{event_id}")


def extract_latest_geometry(event):
    geometry = event.get("geometry", [])
    if geometry:
        return geometry[-1]
    return {}


def safe_join(values):
    return ", ".join(str(v) for v in values if v is not None)


def flatten_event(event):
    latest = extract_latest_geometry(event)

    categories = [c.get("title", "Unknown") for c in event.get("categories", [])]
    category_ids = [c.get("id", "Unknown") for c in event.get("categories", [])]
    sources = [s.get("id", "Unknown") for s in event.get("sources", [])]

    coordinates = latest.get("coordinates", [])
    geometry_type = latest.get("type", "Unknown")
    event_date = latest.get("date", "")

    longitude = None
    latitude = None

    if isinstance(coordinates, list) and len(coordinates) >= 2:
        longitude = coordinates[0]
        latitude = coordinates[1]

    return {
        "id": event.get("id"),
        "title": event.get("title"),
        "description": event.get("description"),
        "link": event.get("link"),
        "closed": event.get("closed"),
        "categories": safe_join(categories),
        "category_ids": safe_join(category_ids),
        "sources": safe_join(sources),
        "geometry_type": geometry_type,
        "date": event_date,
        "longitude": longitude,
        "latitude": latitude,
        "raw_coordinates": json.dumps(coordinates),
    }


def is_weather_related(event):
    weather_keywords = [
        "storm",
        "severe storm",
        "dust storm",
        "tropical cyclone",
        "cyclone",
        "hurricane",
        "typhoon",
        "flood"
    ]

    title = (event.get("title") or "").lower()
    categories = " ".join(
        c.get("title", "").lower() for c in event.get("categories", [])
    )

    combined = f"{title} {categories}"
    return any(keyword in combined for keyword in weather_keywords)


def print_categories(categories_data):
    categories = categories_data.get("categories", [])
    print("\nAVAILABLE CATEGORIES")
    print("-" * 50)
    for cat in categories:
        print(f"ID: {cat.get('id')} | Title: {cat.get('title')}")


def print_event_summary(events):
    print("\nEVENT SUMMARY")
    print("-" * 80)

    if not events:
        print("No events found.")
        return

    for idx, event in enumerate(events, start=1):
        flat = flatten_event(event)
        print(f"{idx}. {flat['title']}")
        print(f"   Event ID     : {flat['id']}")
        print(f"   Categories   : {flat['categories']}")
        print(f"   Date         : {flat['date']}")
        print(f"   Geometry Type: {flat['geometry_type']}")
        print(f"   Coordinates  : ({flat['latitude']}, {flat['longitude']})")
        print(f"   Sources      : {flat['sources']}")
        print()


def save_events_to_json(events, filename="eonet_events.json"):
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(events, f, indent=2, ensure_ascii=False)
    print(f"Saved JSON to {filename}")


def save_events_to_csv(events, filename="eonet_events.csv"):
    flattened = [flatten_event(event) for event in events]

    if not flattened:
        print("No events to save.")
        return

    fieldnames = list(flattened[0].keys())

    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(flattened)

    print(f"Saved CSV to {filename}")


def show_event_details(client, event_id):
    try:
        event = client.get_event_by_id(event_id)
        print("\nFULL EVENT DETAILS")
        print("-" * 80)
        print(json.dumps(event, indent=2, ensure_ascii=False))
    except requests.HTTPError as e:
        print(f"Failed to fetch event {event_id}: {e}")


def menu():
    print("\n" + "=" * 80)
    print("NASA EONET WEATHER / NATURAL EVENT TRACKER")
    print("=" * 80)
    print("1. Show categories")
    print("2. Fetch recent open events")
    print("3. Fetch weather-related events only")
    print("4. Save last fetched events to JSON")
    print("5. Save last fetched events to CSV")
    print("6. Show full event details by ID")
    print("7. Exit")


def main():
    client = EONETClient()
    last_events = []

    while True:
        menu()
        choice = input("\nEnter your choice: ").strip()

        try:
            if choice == "1":
                categories_data = client.get_categories()
                print_categories(categories_data)

            elif choice == "2":
                limit = int(input("Enter limit (example 10, 20, 50): ").strip() or "20")
                days = int(input("Enter number of past days (example 7, 30, 90): ").strip() or "30")
                status = input("Enter status (open/closed/all): ").strip().lower() or "open"

                if status == "all":
                    status = None

                events_data = client.get_events(limit=limit, days=days, status=status) if status else client._get(
                    "events", params={"limit": limit, "days": days}
                )

                last_events = events_data.get("events", [])
                print_event_summary(last_events)

            elif choice == "3":
                limit = int(input("Enter limit (example 20, 50, 100): ").strip() or "50")
                days = int(input("Enter number of past days: ").strip() or "30")

                events_data = client.get_events(limit=limit, days=days, status="open")
                all_events = events_data.get("events", [])
                last_events = [event for event in all_events if is_weather_related(event)]

                print(f"\nFound {len(last_events)} weather-related events out of {len(all_events)} total events.")
                print_event_summary(last_events)

            elif choice == "4":
                if not last_events:
                    print("No events fetched yet.")
                else:
                    filename = input("Enter JSON filename [default: eonet_events.json]: ").strip() or "eonet_events.json"
                    save_events_to_json(last_events, filename)

            elif choice == "5":
                if not last_events:
                    print("No events fetched yet.")
                else:
                    filename = input("Enter CSV filename [default: eonet_events.csv]: ").strip() or "eonet_events.csv"
                    save_events_to_csv(last_events, filename)

            elif choice == "6":
                event_id = input("Enter event ID: ").strip()
                if event_id:
                    show_event_details(client, event_id)
                else:
                    print("Event ID cannot be empty.")

            elif choice == "7":
                print("Exiting program.")
                break

            else:
                print("Invalid choice. Please enter a number from 1 to 7.")

        except requests.RequestException as e:
            print(f"Network/API error: {e}")
        except ValueError:
            print("Invalid input. Please enter numeric values where required.")
        except Exception as e:
            print(f"Unexpected error: {e}")


if __name__ == "__main__":
    print(f"Program started at: {datetime.now()}")
    main()