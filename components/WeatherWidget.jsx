"use client";
import { useState, useEffect } from 'react';

export default function WeatherWidget() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) return;

    fetch('/api/weather', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => {
        if (r.status === 400) {
          return r.json().then(d => {
            if (d.needsSetup) setNeedsSetup(true);
            throw new Error(d.error);
          });
        }
        if (!r.ok) throw new Error('Failed to load weather');
        return r.json();
      })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-4 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
        <div className="h-8 bg-gray-200 rounded w-32" />
      </div>
    );
  }

  if (needsSetup) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-sky-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌤️</span>
            <div>
              <p className="text-sm font-medium text-blue-900">Set up weather</p>
              <p className="text-xs text-blue-700">Add your home airport in Settings to see local weather and job-day forecasts.</p>
            </div>
          </div>
          <a
            href="/settings"
            className="px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 whitespace-nowrap"
          >
            Set Airport
          </a>
        </div>
      </div>
    );
  }

  if (error || !data) return null;
  if (!data.current || !data.forecast) return null;

  const { airport, current, forecast, warnings = [] } = data;

  return (
    <div className="card-hover bg-white rounded-lg shadow overflow-hidden">
      {/* Current conditions header */}
      <div
        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{current.icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-gray-900">{current.temp}°F</span>
                <span className="text-sm text-gray-500">{current.desc}</span>
              </div>
              <p className="text-xs text-gray-400">
                {airport.name} ({airport.code}) · Wind {current.windSpeed} mph · {current.humidity}% humidity
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {warnings.length > 0 && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                {warnings.length} alert{warnings.length !== 1 ? 's' : ''}
              </span>
            )}
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Mini forecast (always visible) */}
        <div className="flex gap-1 mt-3 overflow-x-auto">
          {forecast.slice(0, 7).map((day, i) => (
            <div
              key={day.date}
              className={`flex-1 min-w-[52px] text-center py-1.5 px-1 rounded-lg ${
                i === 0 ? 'bg-blue-50' : ''
              } ${day.rain ? 'ring-1 ring-amber-200' : ''}`}
            >
              <p className="text-[10px] text-gray-500 font-medium">{i === 0 ? 'Today' : day.dayName}</p>
              <p className="text-sm my-0.5">{day.icon}</p>
              <p className="text-[10px] text-gray-700 font-medium">{day.tempMax}°</p>
              <p className="text-[10px] text-gray-400">{day.tempMin}°</p>
            </div>
          ))}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t divide-y">
          {/* Weather warnings for scheduled jobs */}
          {warnings.length > 0 && (
            <div className="p-4 bg-amber-50">
              <h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-2">
                Weather Alerts for Scheduled Jobs
              </h4>
              <div className="space-y-2">
                {warnings.map(w => (
                  <div key={w.jobId} className="flex items-start gap-2 text-sm">
                    <span>{w.icon}</span>
                    <div>
                      <p className="text-amber-900 font-medium">
                        {w.dayName} — {w.weather} ({w.precipProbability}% chance)
                      </p>
                      <p className="text-amber-700 text-xs">
                        {w.clientName}{w.aircraft ? ` · ${w.aircraft}` : ''}
                        {w.precipitation > 0 ? ` · ${w.precipitation}" expected` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extended forecast */}
          <div className="p-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">7-Day Forecast</h4>
            <div className="space-y-2">
              {forecast.map((day, i) => (
                <div key={day.date} className="flex items-center gap-3 text-sm">
                  <span className="w-10 text-gray-500 font-medium text-xs">{i === 0 ? 'Today' : day.dayName}</span>
                  <span className="text-lg w-7">{day.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-1">
                      <div className="h-1.5 rounded-full bg-gray-200 flex-1 relative overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-400 to-orange-400"
                          style={{
                            marginLeft: `${((day.tempMin - 20) / 80) * 100}%`,
                            width: `${((day.tempMax - day.tempMin) / 80) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 w-7 text-right">{day.tempMin}°</span>
                  <span className="text-xs text-gray-700 font-medium w-7 text-right">{day.tempMax}°</span>
                  {day.precipProbability > 20 && (
                    <span className="text-[10px] text-blue-500 w-8 text-right">{day.precipProbability}%</span>
                  )}
                  {day.windMax > 20 && (
                    <span className="text-[10px] text-gray-400 w-12 text-right">{day.windMax}mph</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
