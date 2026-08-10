# 🌦️ AI Weather Intelligence

A global, location-aware weather dashboard using free weather/location APIs and an optional free-tier Gemini AI report.

## Features

- 🌍 Search virtually any worldwide location
- 📍 Live browser GPS location
- 🔎 Location suggestions
- 🌤️ Current weather
- 🕐 24-hour forecast
- 📅 7-day forecast
- 📈 Temperature trend
- 🤖 AI weather report
- 📚 7 days of recent weather data supplied by Open-Meteo
- 🌙 Dark/light mode
- 💾 Recent locations
- 📱 Responsive design
- 🔐 AI key stored only in backend environment variables

## APIs

- Open-Meteo Forecast API — weather
- Open-Meteo Geocoding API — location search
- OpenStreetMap Nominatim — reverse geocoding for live GPS
- Gemini API — optional natural-language AI report

## Run locally

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python app.py
```

Then open `frontend/index.html`.

## Deployment

Deploy the Flask backend first. Then change `API_BASE` in `frontend/script.js` from the local URL to your deployed backend URL.

Example:

```js
const API_BASE = "https://your-backend-domain.com/api";
```

Never commit `.env` or a real API key to GitHub.
