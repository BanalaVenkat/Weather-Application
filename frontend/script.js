const API_BASE = "https://74.220.48.0/api"; // Replace for production deployment.

const $ = (id) => document.getElementById(id);
const input = $("location-input");
const results = $("location-results");
const status = $("status");
const content = $("weather-content");
const empty = $("empty-state");
let searchTimer;

const weatherEmoji = {
    0:"☀️",1:"🌤️",2:"⛅",3:"☁️",45:"🌫️",48:"🌫️",
    51:"🌦️",53:"🌦️",55:"🌧️",56:"🌧️",57:"🌧️",
    61:"🌧️",63:"🌧️",65:"🌧️",66:"🌧️",67:"🌧️",
    71:"🌨️",73:"❄️",75:"❄️",77:"❄️",
    80:"🌦️",81:"🌧️",82:"🌧️",85:"🌨️",86:"❄️",
    95:"⛈️",96:"⛈️",99:"⛈️"
};

const weatherText = {
    0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",
    45:"Fog",48:"Depositing rime fog",51:"Light drizzle",53:"Moderate drizzle",
    55:"Dense drizzle",56:"Freezing drizzle",57:"Dense freezing drizzle",
    61:"Slight rain",63:"Moderate rain",65:"Heavy rain",66:"Freezing rain",
    67:"Heavy freezing rain",71:"Slight snow",73:"Moderate snow",75:"Heavy snow",
    77:"Snow grains",80:"Slight rain showers",81:"Moderate rain showers",
    82:"Violent rain showers",85:"Slight snow showers",86:"Heavy snow showers",
    95:"Thunderstorm",96:"Thunderstorm with hail",99:"Thunderstorm with heavy hail"
};

function setStatus(message, error=false) {
    status.textContent = message;
    status.classList.remove("hidden");
    status.style.color = error ? "#d64a4a" : "";
}
function clearStatus() { status.classList.add("hidden"); }

async function api(path, options={}) {
    const response = await fetch(`${API_BASE}${path}`, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
}

async function searchLocations(query) {
    if (query.trim().length < 2) {
        results.classList.add("hidden");
        return;
    }
    try {
        const data = await api(`/geocode?q=${encodeURIComponent(query.trim())}`);
        results.innerHTML = "";
        if (!data.results?.length) {
            results.innerHTML = `<div class="result"><span>No locations found.</span></div>`;
        } else {
            data.results.forEach(place => {
                const el = document.createElement("div");
                el.className = "result";
                el.innerHTML = `<strong>${escapeHtml(place.name)}</strong>
                    <span>${escapeHtml(place.display_name)}</span>`;
                el.addEventListener("click", () => selectLocation(place));
                results.appendChild(el);
            });
        }
        results.classList.remove("hidden");
    } catch (e) {
        results.classList.add("hidden");
    }
}

function escapeHtml(value="") {
    return String(value).replace(/[&<>"']/g, c => ({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[c]));
}

async function selectLocation(place) {
    results.classList.add("hidden");
    input.value = place.name;
    await loadWeather(place);
}

async function loadWeather(place) {
    setStatus("Loading weather intelligence...");
    content.classList.add("hidden");
    empty.classList.add("hidden");

    try {
        const data = await api(`/weather?latitude=${place.latitude}&longitude=${place.longitude}`);
        renderWeather(place, data);
        saveRecent(place);
        await loadAIReport(place, data);
        clearStatus();
        content.classList.remove("hidden");
    } catch (e) {
        setStatus(e.message, true);
        empty.classList.remove("hidden");
    }
}

function renderWeather(place, data) {
    $("location-name").textContent = place.name;
    $("location-address").textContent = place.display_name;
    const c = data.current;
    const daily = data.daily;

    $("weather-icon").textContent = weatherEmoji[c.weather_code] || "🌤️";
    $("temperature").textContent = `${Math.round(c.temperature_2m)}°`;
    $("condition").textContent = weatherText[c.weather_code] || "Unknown";
    $("feels-like").textContent = `${Math.round(c.apparent_temperature)}°`;
    $("humidity").textContent = `${Math.round(c.relative_humidity_2m)}%`;
    $("wind").textContent = `${Math.round(c.wind_speed_10m)} km/h`;
    $("rain").textContent = `${Math.round(daily.precipitation_probability_max[0] ?? 0)}%`;
    $("visibility").textContent = c.visibility != null ? `${(c.visibility/1000).toFixed(1)} km` : "N/A";
    $("sunrise").textContent = formatTime(daily.sunrise[0]);
    $("sunset").textContent = formatTime(daily.sunset[0]);

    renderHourly(data);
    renderDaily(data);
    renderTrend(data);
}

function formatTime(value) {
    if (!value) return "--";
    return new Date(value).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
}
function formatDay(value) {
    return new Date(`${value}T12:00:00`).toLocaleDateString([], {weekday:"short"});
}

function renderHourly(data) {
    const el = $("hourly");
    el.innerHTML = "";
    const now = new Date();
    const start = data.hourly.time.findIndex(t => new Date(t) >= now);
    const first = start < 0 ? 0 : start;

    for (let i=first; i<Math.min(first+24, data.hourly.time.length); i++) {
        const card = document.createElement("div");
        card.className = "hour";
        card.innerHTML = `<div class="time">${formatTime(data.hourly.time[i])}</div>
            <div class="icon">${weatherEmoji[data.hourly.weather_code[i]] || "🌤️"}</div>
            <strong>${Math.round(data.hourly.temperature_2m[i])}°</strong>
            <div class="rain">💧 ${data.hourly.precipitation_probability[i] ?? 0}%</div>`;
        el.appendChild(card);
    }
}

function renderDaily(data) {
    const el = $("daily");
    el.innerHTML = "";
    data.daily.time.forEach((date,i) => {
        const card = document.createElement("div");
        card.className = "day";
        card.innerHTML = `<div class="date">${i === 0 ? "Today" : formatDay(date)}</div>
            <div class="icon">${weatherEmoji[data.daily.weather_code[i]] || "🌤️"}</div>
            <div class="temps">${Math.round(data.daily.temperature_2m_max[i])}° / ${Math.round(data.daily.temperature_2m_min[i])}°</div>
            <div class="rain">💧 ${data.daily.precipitation_probability_max[i] ?? 0}%</div>`;
        el.appendChild(card);
    });
}

function renderTrend(data) {
    const el = $("trend");
    el.innerHTML = "";
    const values = data.daily.temperature_2m_max;
    const min = Math.min(...values), max = Math.max(...values);
    values.forEach(v => {
        const height = max === min ? 55 : 25 + ((v-min)/(max-min))*65;
        const bar = document.createElement("div");
        bar.className = "bar";
        bar.style.height = `${height}%`;
        bar.innerHTML = `<span>${Math.round(v)}°</span>`;
        el.appendChild(bar);
    });
}

async function loadAIReport(place, data) {
    $("ai-report").innerHTML = `<div class="skeleton"></div><div class="skeleton short"></div>`;
    try {
        const report = await api("/ai-report", {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({location:place, weather:data})
        });
        $("ai-source").textContent = report.source === "gemini" ? "Gemini + weather data" : "Local AI fallback";
        $("ai-report").innerHTML = report.html;
    } catch (e) {
        $("ai-source").textContent = "Local AI fallback";
        $("ai-report").innerHTML = `<h3>Weather Insight</h3><p>Weather data is available, but the AI report could not be generated.</p>`;
    }
}

function saveRecent(place) {
    let list = JSON.parse(localStorage.getItem("weatherRecent") || "[]");
    list = [place, ...list.filter(x => `${x.latitude},${x.longitude}` !== `${place.latitude},${place.longitude}`)].slice(0,6);
    localStorage.setItem("weatherRecent", JSON.stringify(list));
    renderRecent();
}

function renderRecent() {
    const wrap = $("recent-locations");
    wrap.innerHTML = "";
    JSON.parse(localStorage.getItem("weatherRecent") || "[]").forEach(place => {
        const b = document.createElement("button");
        b.className = "recent";
        b.textContent = `📍 ${place.name}`;
        b.onclick = () => loadWeather(place);
        wrap.appendChild(b);
    });
}

async function useLiveLocation() {
    if (!navigator.geolocation) return setStatus("Geolocation is not supported by this browser.", true);
    setStatus("Getting your live location...");
    navigator.geolocation.getCurrentPosition(async pos => {
        try {
            const place = await api(`/reverse-geocode?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}`);
            await loadWeather(place);
        } catch(e) { setStatus(e.message, true); }
    }, () => setStatus("Location permission was denied or unavailable.", true), {
        enableHighAccuracy:true, timeout:10000, maximumAge:300000
    });
}

$("search-btn").onclick = () => searchLocations(input.value);
$("gps-btn").onclick = useLiveLocation;
input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => searchLocations(input.value), 350);
});
input.addEventListener("keydown", e => {
    if (e.key === "Enter") searchLocations(input.value);
});
document.addEventListener("click", e => {
    if (!e.target.closest(".location-panel")) results.classList.add("hidden");
});
$("theme-toggle").onclick = () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("weatherTheme", document.body.classList.contains("dark") ? "dark" : "light");
    $("theme-toggle").textContent = document.body.classList.contains("dark") ? "☀️" : "🌙";
};
if (localStorage.getItem("weatherTheme") === "dark") {
    document.body.classList.add("dark");
    $("theme-toggle").textContent = "☀️";
}
renderRecent();
