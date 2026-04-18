from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import requests

app = FastAPI(title="Weather API with Open-Meteo")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


WEATHER_CODES = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


def get_location(place: str):
    params = {
        "name": place,
        "count": 1,
        "language": "en",
        "format": "json"
    }

    try:
        res = requests.get(GEOCODE_URL, params=params, timeout=15)
        res.raise_for_status()
        data = res.json()
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="Failed to fetch location data")

    results = data.get("results")
    if not results:
        return None

    loc = results[0]
    return {
        "name": loc.get("name"),
        "country": loc.get("country"),
        "country_code": loc.get("country_code"),
        "latitude": loc.get("latitude"),
        "longitude": loc.get("longitude"),
        "timezone": loc.get("timezone") or "auto"
    }


def get_weather(latitude: float, longitude: float, timezone: str):
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
        "timezone": timezone,
        "forecast_days": 3
    }

    try:
        res = requests.get(FORECAST_URL, params=params, timeout=15)
        res.raise_for_status()
        return res.json()
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="Failed to fetch weather data")


@app.get("/")
def home():
    return {
        "message": "Weather API is running",
        "usage": "/weather?place=Chennai"
    }


@app.get("/weather")
def weather(place: str = Query(..., description="City or place name")):
    location = get_location(place.strip())
    if not location:
        raise HTTPException(status_code=404, detail="Place not found")

    weather_data = get_weather(
        latitude=location["latitude"],
        longitude=location["longitude"],
        timezone=location["timezone"]
    )

    current = weather_data.get("current", {})
    daily = weather_data.get("daily", {})

    current_code = current.get("weather_code")
    current_description = WEATHER_CODES.get(current_code, "Unknown")

    daily_codes = daily.get("weather_code", [])
    daily_descriptions = [WEATHER_CODES.get(code, "Unknown") for code in daily_codes]

    return {
        "location": location,
        "current": {
            "time": current.get("time"),
            "temperature_2m": current.get("temperature_2m"),
            "relative_humidity_2m": current.get("relative_humidity_2m"),
            "wind_speed_10m": current.get("wind_speed_10m"),
            "weather_code": current_code,
            "weather_description": current_description
        },
        "daily": {
            "time": daily.get("time", []),
            "weather_code": daily_codes,
            "weather_description": daily_descriptions,
            "temperature_2m_max": daily.get("temperature_2m_max", []),
            "temperature_2m_min": daily.get("temperature_2m_min", []),
            "precipitation_sum": daily.get("precipitation_sum", [])
        }
    }