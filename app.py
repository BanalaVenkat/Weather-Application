import os
import html
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY_HERE")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"


def request_json(url, params=None, headers=None, timeout=15):
    response = requests.get(url, params=params, headers=headers, timeout=timeout)
    response.raise_for_status()
    return response.json()


def build_display_name(p):
    parts = []
    for key in ("name", "city", "town", "village", "municipality", "county", "state", "country"):
        value = p.get(key)
        if value and value not in parts:
            parts.append(value)
    return ", ".join(parts)


@app.get("/")
def home():
    return jsonify({"status": "ok", "message": "AI Weather Intelligence API is running"})


@app.get("/api/geocode")
def geocode():
    q = request.args.get("q", "").strip()
    if len(q) < 2:
        return jsonify({"results": []})
    try:
        data = request_json(GEOCODE_URL, {
            "name": q, "count": 8, "language": "en", "format": "json"
        })
        results = []
        for p in data.get("results", []):
            results.append({
                "name": p.get("name", "Unknown"),
                "latitude": p["latitude"],
                "longitude": p["longitude"],
                "country": p.get("country", ""),
                "state": p.get("admin1", ""),
                "district": p.get("admin2", ""),
                "display_name": ", ".join(filter(None, [
                    p.get("name"), p.get("admin2"), p.get("admin1"), p.get("country")
                ]))
            })
        return jsonify({"results": results})
    except requests.RequestException as e:
        return jsonify({"error": f"Geocoding service unavailable: {e}"}), 502


@app.get("/api/reverse-geocode")
def reverse_geocode():
    try:
        lat = float(request.args["latitude"])
        lon = float(request.args["longitude"])
        data = request_json(
            NOMINATIM_URL,
            {"lat": lat, "lon": lon, "format": "jsonv2", "zoom": 18, "addressdetails": 1},
            headers={"User-Agent": "WeatherIntelligenceApp/1.0 (replace-with-your-email@example.com)"}
        )
        address = data.get("address", {})
        name = (address.get("amenity") or address.get("building") or address.get("road")
                or address.get("city") or address.get("town") or address.get("village")
                or "Current Location")
        place = {
            "name": name,
            "latitude": lat,
            "longitude": lon,
            "display_name": data.get("display_name") or build_display_name(address),
        }
        return jsonify(place)
    except (KeyError, ValueError):
        return jsonify({"error": "Valid latitude and longitude are required"}), 400
    except requests.RequestException:
        return jsonify({"error": "Reverse geocoding service unavailable"}), 502


@app.get("/api/weather")
def weather():
    try:
        lat = float(request.args["latitude"])
        lon = float(request.args["longitude"])
    except (KeyError, ValueError):
        return jsonify({"error": "Valid latitude and longitude are required"}), 400

    params = {
        "latitude": lat, "longitude": lon,
        "current": ",".join([
            "temperature_2m", "relative_humidity_2m", "apparent_temperature",
            "weather_code", "wind_speed_10m", "wind_direction_10m", "visibility"
        ]),
        "hourly": ",".join([
            "temperature_2m", "apparent_temperature", "precipitation_probability",
            "precipitation", "weather_code", "relative_humidity_2m", "wind_speed_10m"
        ]),
        "daily": ",".join([
            "weather_code", "temperature_2m_max", "temperature_2m_min",
            "apparent_temperature_max", "apparent_temperature_min",
            "precipitation_probability_max", "precipitation_sum",
            "sunrise", "sunset", "wind_speed_10m_max"
        ]),
        "past_days": 7,
        "forecast_days": 7,
        "timezone": "auto"
    }
    try:
        return jsonify(request_json(WEATHER_URL, params))
    except requests.RequestException:
        return jsonify({"error": "Weather service unavailable"}), 502


def local_ai_report(weather):
    c = weather["current"]
    d = weather["daily"]
    temp = c["temperature_2m"]
    rain = d["precipitation_probability_max"][0] or 0
    tomorrow = d["temperature_2m_max"][1] if len(d["temperature_2m_max"]) > 1 else temp
    change = tomorrow - temp

    if rain >= 70:
        advice = "Rain is quite likely. Carry an umbrella and plan outdoor activities carefully."
    elif rain >= 40:
        advice = "There is a moderate chance of rain. Carrying an umbrella may be useful."
    else:
        advice = "Rain probability is relatively low, so outdoor plans look less weather-sensitive."

    trend = "warmer" if change > 1 else "cooler" if change < -1 else "similar"
    return {
        "source": "local",
        "html": (
            "<h3>Today</h3>"
            f"<p>Current temperature is <strong>{temp:.0f}°C</strong>. "
            f"The maximum rain probability today is about <strong>{rain:.0f}%</strong>.</p>"
            "<h3>Future Trend</h3>"
            f"<p>Tomorrow looks <strong>{trend}</strong> compared with the current temperature.</p>"
            "<h3>Recommendation</h3>"
            f"<p>{advice}</p>"
        )
    }


def call_gemini(location, weather):
    if not GEMINI_API_KEY or GEMINI_API_KEY.startswith("YOUR_"):
        return None

    c = weather["current"]
    d = weather["daily"]
    prompt = f"""
You are a weather-report assistant. Analyze ONLY the supplied weather data.
Do not invent observations or claim certainty about future weather.
Give a concise, useful report with exactly these sections:
Today, Future Trend, Recommendation.
Mention unusual changes if supported by the data.

Location: {location.get("display_name")}
Current: {c}
Daily forecast: {d}
Historical past 7 days: {weather.get("past_days", "included in supplied dataset")}
"""

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    response = requests.post(
        url,
        params={"key": GEMINI_API_KEY},
        json={"contents": [{"parts": [{"text": prompt}]}]},
        timeout=20
    )
    response.raise_for_status()
    text = response.json()["candidates"][0]["content"]["parts"][0]["text"]

    safe = html.escape(text).replace("\n\n", "</p><p>").replace("\n", "<br>")
    return {"source": "gemini", "html": f"<p>{safe}</p>"}


@app.post("/api/ai-report")
def ai_report():
    body = request.get_json(silent=True) or {}
    location = body.get("location") or {}
    weather = body.get("weather")
    if not weather:
        return jsonify({"error": "Weather data is required"}), 400

    try:
        result = call_gemini(location, weather)
        return jsonify(result or local_ai_report(weather))
    except Exception:
        return jsonify(local_ai_report(weather))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
