// File: src/App.jsx
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Plot from 'react-plotly.js';
import './App.css';

// Add error boundary component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Plot error caught:', error);
    console.error('Error info:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(255, 0, 0, 0.1)',
          padding: '20px',
          borderRadius: '8px',
          color: 'red'
        }}>
          <h2>Something went wrong with the map</h2>
          <pre>{this.state.error?.toString()}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [data, setData] = useState([]);
  const [mapInitialized, setMapInitialized] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [filters, setFilters] = useState({
    lineTypes: ['bus', 'tram', 'metro'],
    timeMode: 'whole_day',
    hour: 'all'
  });
  const [mapLayout, setMapLayout] = useState({
    mapbox: {
      style: 'carto-positron',
      center: { lat: 52.237049, lon: 21.017532 },
      zoom: 11
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    autosize: true,
    margin: { t: 0, b: 0, l: 0, r: 0 }
  });

  // Add theme control state - change to 'system', 'light', or 'dark'
  const [themeMode, setThemeMode] = useState('system');
  
  // Add theme detection
  const [isDarkMode, setIsDarkMode] = useState(window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Listen for theme changes if using system theme
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      if (themeMode === 'system') {
        setIsDarkMode(e.matches);
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themeMode]);

  // Update dark mode when theme mode changes
  useEffect(() => {
    if (themeMode === 'system') {
      setIsDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.body.classList.remove('light-mode', 'dark-mode');
    } else {
      setIsDarkMode(themeMode === 'dark');
      document.body.classList.remove('light-mode', 'dark-mode');
      document.body.classList.add(`${themeMode}-mode`);
    }
  }, [themeMode]);

  // Update map style based on theme
  useEffect(() => {
    setMapLayout(prev => ({
      ...prev,
      mapbox: {
        ...prev.mapbox,
        style: isDarkMode ? 'carto-darkmatter' : 'carto-positron'
      }
    }));
  }, [isDarkMode]);

  // Initialize map when component mounts
  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    console.log('Setting up Mapbox with token:', token ? 'Token available' : 'Token missing');
    
    if (token) {
      try {
        // Force token to be applied directly to window for Mapbox fallback access
        window.MAPBOX_ACCESS_TOKEN = token;
        
        setMapLayout(prev => ({
          ...prev,
          mapbox: {
            ...prev.mapbox,
            accesstoken: token,
          }
        }));
        setMapInitialized(true);
        setMapError(null);
        console.log('Map initialized state set to true');
      } catch (error) {
        console.error('Error initializing map:', error);
        setMapError(error.message || 'Failed to initialize map');
      }
    } else {
      setMapError('Mapbox token not found in environment variables');
      console.error('Mapbox token not found in environment variables');
    }
  }, [retryCount]);

  useEffect(() => {
    console.log('Fetching data...');
    fetch('/aggregated_data.json')
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        console.log('Response received:', res.status);
        return res.json();
      })
      .then(jsonData => {
        if (!Array.isArray(jsonData)) {
          throw new Error('Data is not an array!');
        }
        console.log('Data loaded:', jsonData.length, 'items');
        console.log('Sample item:', jsonData[0]);
        setData(jsonData);
        console.log('setData called successfully');
      })
      .catch(error => {
        console.error('Error loading data:', error);
      });
  }, []);

  const filteredData = data.filter(item => {
    const typeMatch = {
      'bus': item.type === 'Autobus',
      'tram': item.type === 'Tramwaj',
      'metro': item.type === 'Metro'
    };
    
    const timeMatch = filters.timeMode === 'whole_day' ? 
      true : 
      item.hour === parseInt(filters.hour);
    
    return filters.lineTypes.some(type => typeMatch[type]) && timeMatch;
  });

  // Apply lineType filter *before* potential aggregation
  const typeFilteredData = data.filter(item => {
    const typeMatch = {
      'bus': item.type === 'Autobus',
      'tram': item.type === 'Tramwaj',
      'metro': item.type === 'Metro'
    };
    return filters.lineTypes.some(type => typeMatch[type]);
  });

  // Add a state for the selected range
  const [selectedRange, setSelectedRange] = useState([0, 20000]);
  
  // Use a ref to track if this is a filter update, which should preserve zoom
  const isFilterUpdate = React.useRef(false);
  
  // Override the Plotly relayout to maintain zoom/position during filter changes
  const handleRelayout = useCallback((newLayout) => {
    if (newLayout.mapbox && !isFilterUpdate.current) {
      // Only update the layout if this isn't from a filter change
      setMapLayout(prevLayout => ({
        ...prevLayout,
        mapbox: {
          ...prevLayout.mapbox,
          ...newLayout.mapbox
        }
      }));
    }
    // Reset the filter update flag
    isFilterUpdate.current = false;
  }, []);

  // Update filtered data without changing map view
  const updateFilters = (newFilters) => {
    console.log('Updating filters:', newFilters);
    // Set the flag to indicate this is a filter update
    isFilterUpdate.current = true;
    setFilters(newFilters);
  };

  // Filter data based on the selected range
  const plotData = useMemo(() => {
    // Early return if no data
    if (!data.length) return [];
    
    // For hourly mode, make sure we have valid hour data
    if (filters.timeMode === 'hourly') {
      // Get all available hours in the dataset
      const availableHours = [...new Set(data.map(item => item.hour))].sort((a, b) => a - b);
      
      // If no data for current hour, use first available hour
      if (availableHours.length > 0 && !availableHours.includes(parseInt(filters.hour))) {
        // Don't update filter here to avoid infinite loop, just use available hour for display
      }
    }
    
    const baseData = filters.timeMode === 'whole_day' 
      ? Object.values(
          typeFilteredData.reduce((acc, item) => {
            const key = `${item.name}-${item.lat}-${item.lon}-${item.type}`;
            if (!acc[key]) {
              acc[key] = {...item, count: 0};
            }
            // Sum all counts for whole day view
            acc[key].count += item.count;
            return acc;
          }, {})
        )
      : filteredData;
    
    // Improved filtering logic for hourly mode to provide consistent results
    if (filters.timeMode === 'hourly' && baseData.length > 0) {
      // Sort the data by passenger count in descending order
      const sortedData = [...baseData].sort((a, b) => b.count - a.count);
      
      // Always respect the threshold - don't show stops below the threshold
      const filteredWithThreshold = sortedData.filter(d => d.count >= selectedRange[0]);
      
      return filteredWithThreshold;
    } else {
      // For whole day mode, just apply the threshold normally
      const filteredWithThreshold = baseData.filter(d => d.count >= selectedRange[0]);
      return filteredWithThreshold;
    }
  }, [data, typeFilteredData, filteredData, filters.timeMode, filters.hour, selectedRange]);

  // Use different max calculations based on mode
  const maxCount = useMemo(() => {
    // Early return if no data
    if (data.length === 0) return 20000;
    
    if (filters.timeMode === 'hourly') {
      // For hourly mode: find the maximum passenger count across ALL hours
      // Group data by station/location
      const stationMaxCounts = {};
      
      data.forEach(item => {
        const key = `${item.name}-${item.lat}-${item.lon}-${item.type}`;
        stationMaxCounts[key] = Math.max(stationMaxCounts[key] || 0, item.count);
      });
      
      // Get the overall maximum passenger count for any station in any hour
      const maxHourlyCount = Math.max(...Object.values(stationMaxCounts), 2000);
      
      // Add a small buffer for visualization
      return Math.ceil(maxHourlyCount * 1.1);
    } else {
      // For daily mode: find the busiest stop (with highest total sum)
      // Group by station
      const stationTotals = {};
      data.forEach(item => {
        const key = `${item.name}-${item.lat}-${item.lon}-${item.type}`;
        stationTotals[key] = (stationTotals[key] || 0) + item.count;
      });
      
      // Find max total
      const maxTotal = Math.max(...Object.values(stationTotals), 20000);
      return maxTotal;
    }
  }, [data, filters.timeMode]);  // Remove hour dependency to keep max consistent

  // Get the min passenger count
  const minCount = useMemo(() => {
    return 0; // Always start at 0 for better visualization
  }, []);

  // Preserve map state across mode switches
  const handleTimeModeChange = (newMode) => {
    // Set the flag to indicate this is a filter update
    isFilterUpdate.current = true;
    
    if (newMode === 'hourly') {
      // Find the hour with most data points
      const hourCounts = {};
      data.forEach(item => {
        hourCounts[item.hour] = (hourCounts[item.hour] || 0) + 1;
      });
      
      const bestHour = Object.entries(hourCounts)
        .sort((a, b) => b[1] - a[1])
        .map(entry => parseInt(entry[0]))[0] || 12; // Default to 12 if no data
      
      updateFilters({ ...filters, timeMode: newMode, hour: bestHour });
    } else {
      updateFilters({ ...filters, timeMode: newMode, hour: 'all' });
    }
  };

  // Make sure changing hour slider doesn't reset the map view
  const handleHourChange = (newHour) => {
    // Set the flag to indicate this is a filter update
    isFilterUpdate.current = true;
    updateFilters({ ...filters, hour: parseInt(newHour) });
  };

  // Update passenger count threshold without losing map position
  const handlePassengerCountChange = (value) => {
    // Set the flag to indicate this is a filter update
    isFilterUpdate.current = true;
    setSelectedRange([parseInt(value), maxCount]);
  };

  // Generate hour ticks for every hour
  const hourTicks = [];
  for (let i = 0; i <= 23; i++) {
    hourTicks.push(
      <div key={i} className={`hour-tick ${i % 3 === 0 ? 'major' : ''}`}>
        {i}:00
      </div>
    );
  }

  // Log debug info
  console.log('Mapbox Token:', import.meta.env.VITE_MAPBOX_TOKEN);
  console.log('Rendering Plot with data:', plotData.length, 'items', plotData.slice(0, 5));
  console.log('mapInitialized state:', mapInitialized);

  // Update plot config to use filtered data
  const plotConfig = useMemo(() => {
    // Log token again to check availability at the time of plot config creation
    console.log('Using Mapbox token in plot config:', import.meta.env.VITE_MAPBOX_TOKEN ? 'Token available' : 'Token missing');
    
    // Determine the appropriate text color for the colorbar based on theme
    const colorbarTextColor = isDarkMode ? '#eee' : '#333';
    
    return {
      data: plotData.length > 0 ? [{
        type: 'densitymapbox',
        lat: plotData.map(d => d.lat),
        lon: plotData.map(d => d.lon),
        z: plotData.map(d => d.count),
        radius: 20,
        colorscale: 'Viridis',
        showscale: true,
        hoverongaps: false,
        hoverlabel: {
          bgcolor: isDarkMode ? 'rgba(30, 30, 30, 0.9)' : 'rgba(240, 240, 240, 0.9)',
          bordercolor: isDarkMode ? '#555' : '#ccc',
          font: { color: isDarkMode ? '#eee' : '#333' }
        },
        customdata: plotData.map(d => ({ name: d.name, count: d.count, type: d.type })),
        hovertemplate: '<b>Station:</b> %{customdata.name}<br>' +
                     '<b>Passengers:</b> %{customdata.count}<br>' +
                     '<b>Transport:</b> %{customdata.type}<extra></extra>',
        colorbar: {
          title: 'Passenger Count',
          len: 0.6,
          thickness: 12,
          x: 0.98,
          y: 0.5,
          xanchor: 'right',
          yanchor: 'middle',
          bgcolor: 'rgba(0,0,0,0)',
          tickfont: { color: colorbarTextColor },
          titlefont: { color: colorbarTextColor },
          bordercolor: 'rgba(0,0,0,0)',
          borderwidth: 0,
          outlinewidth: 0,
          dtick: 5000
        },
        opacity: 0.8,
        // Set fixed zmin and zmax to ensure colorbar range doesn't change
        zmin: minCount,
        zmax: maxCount
      }] : [{ type: 'scattermapbox', lat: [52.237049], lon: [21.017532], mode: 'markers', marker: { opacity: 0 } }],
      layout: {
        ...mapLayout,
        hovermode: 'closest',
        dragmode: 'zoom',
        mapbox: {
          style: isDarkMode ? 'carto-darkmatter' : 'carto-positron',
          center: { lat: 52.237049, lon: 21.017532 },
          zoom: 11,
          accesstoken: import.meta.env.VITE_MAPBOX_TOKEN || window.MAPBOX_ACCESS_TOKEN
        },
        margin: { r: 10, t: 0, b: 0, l: 0 }
      },
      config: {
        displayModeBar: true,
        displaylogo: false,
        responsive: true,
        scrollZoom: true,
        modeBarButtonsToAdd: ['select2d', 'lasso2d'],
        modeBarButtonsToRemove: ['toImage', 'sendDataToCloud'],
      }
    };
  }, [plotData, mapLayout, minCount, maxCount, isDarkMode]);

  // Only keep essential logging
  useEffect(() => {
    // Only log once data is loaded or filters change significantly
    if (data.length > 0) {
      // This log will show when data is loaded or major filter changes happen
    }
  }, [data.length, filters.timeMode]);

  // Add a function to retry map initialization
  const retryMapInitialization = () => {
    console.log('Retrying map initialization...');
    setMapInitialized(false);
    setRetryCount(prev => prev + 1);
  };

  return (
    <div className="app-container">
      {/* Debug info */}
      <div className="debug-info">
        Data points: {data.length} | Bus stops: {plotData.length} | Map Initialized: {mapInitialized ? 'Yes' : 'No'}
      </div>

      {/* Theme toggle buttons in top right */}
      <div className="theme-toggle">
        <button 
          onClick={() => setThemeMode('system')}
          className={`theme-button ${themeMode === 'system' ? 'active' : ''}`}
        >
          System
        </button>
        <button 
          onClick={() => setThemeMode('light')}
          className={`theme-button ${themeMode === 'light' ? 'active' : ''}`}
        >
          Light
        </button>
        <button 
          onClick={() => setThemeMode('dark')}
          className={`theme-button ${themeMode === 'dark' ? 'active' : ''}`}
        >
          Dark
        </button>
      </div>

      {/* Controls with fixed positioning and better spacing */}
      <div style={{
        position: 'fixed',
        top: 60,
        left: 10,
        zIndex: 1000,
        background: 'var(--overlay-bg)',
        color: 'var(--overlay-text)',
        padding: '12px',
        borderRadius: 4,
        backdropFilter: 'blur(5px)',
      }}>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ marginRight: '12px' }}>
            <input
              type="radio"
              name="timeMode"
              checked={filters.timeMode === 'whole_day'}
              onChange={() => handleTimeModeChange('whole_day')}
              style={{ marginRight: '6px' }}
            />
            Whole Day
          </label>
          <label>
            <input
              type="radio"
              name="timeMode"
              checked={filters.timeMode === 'hourly'}
              onChange={() => handleTimeModeChange('hourly')}
              style={{ marginRight: '6px' }}
            />
            Hourly
          </label>
        </div>

        <div>
          {['bus', 'tram', 'metro'].map(type => (
            <label key={type} style={{ display: 'block', marginBottom: '8px' }}>
              <input
                type="checkbox"
                checked={filters.lineTypes.includes(type)}
                onChange={e => {
                  const updated = e.target.checked
                    ? [...filters.lineTypes, type]
                    : filters.lineTypes.filter(t => t !== type);
                  updateFilters({ ...filters, lineTypes: updated });
                }}
                style={{ marginRight: '6px' }}
              />
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </label>
          ))}
        </div>
      </div>

      {/* Hour slider with full hours and transparent background */}
      {filters.timeMode === 'hourly' && (
        <div className="hour-slider-container">
          <input
            type="range"
            min="0"
            max="23"
            value={filters.hour === 'all' ? 12 : filters.hour}
            onChange={e => handleHourChange(e.target.value)}
            className="hour-slider"
          />
          <div className="hour-ticks">
            {Array.from({ length: 24 }, (_, i) => (
              <span key={i} className={`hour-tick ${i % 3 === 0 ? 'major' : ''}`}>{i}:00</span>
            ))}
          </div>
        </div>
      )}

      {/* Passenger count slider */}
      <div className="vertical-slider-container">
        <div className="vertical-slider-label">Min: {selectedRange[0]}</div>
        <div className="vertical-slider-wrapper">
          <input
            type="range"
            min={minCount}
            max={maxCount}
            step={(maxCount - minCount) / 100}
            value={selectedRange[0]}
            onChange={e => handlePassengerCountChange(e.target.value)}
            className="vertical-slider"
          />
        </div>
      </div>

      <style>{`
        /* Additional slider styles to ensure cross-browser compatibility */
        .hour-slider {
          width: 100%;
          background: transparent;
          height: 4px;
          -webkit-appearance: none;
          appearance: none;
          cursor: pointer;
        }
        
        .hour-slider::-webkit-slider-runnable-track {
          width: 100%;
          height: 4px;
          background: var(--slider-track);
          border: none;
          borderRadius: 2px;
        }
        
        .hour-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--slider-thumb);
          cursor: pointer;
          margin-top: -6px;
          box-shadow: 0 0 4px rgba(0,0,0,0.3);
        }
        
        .hour-slider::-moz-range-track {
          width: 100%;
          height: 4px;
          background: var(--slider-track);
          border: none;
          borderRadius: 2px;
        }
        
        .hour-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--slider-thumb);
          cursor: pointer;
          border: none;
          box-shadow: 0 0 4px rgba(0,0,0,0.3);
        }
        
        /* Additional styles for the hour ticks */
        .hour-ticks {
          display: flex;
          justify-content: space-between;
          margin-top: 5px;
          font-size: 12px;
        }
      `}</style>

      <ErrorBoundary>
        {mapInitialized ? (
          <Plot
            data={plotConfig.data}
            layout={plotConfig.layout}
            config={plotConfig.config}
            style={{ width: '100vw', height: '100vh' }}
            onRelayout={handleRelayout}
            onError={(err) => {
              console.error('Plot error:', err);
              setMapError(err.message || 'Error rendering the map');
              setMapInitialized(false);
            }}
            onInitialized={(fig) => {
              console.log('Plot component initialized!', fig);
              console.log('Current Mapbox token:', fig.layout?.mapbox?.accesstoken ? 'Token present' : 'Token missing');
              setMapError(null);
              window.requestAnimationFrame(() => {
                window.dispatchEvent(new Event('resize'));
              });
            }}
            useResizeHandler={true}
          />
        ) : (
          <div className="loading-indicator">
            <h2>{mapError ? 'Map Error' : 'Initializing Map...'}</h2>
            {mapError ? (
              <>
                <p>Error: {mapError}</p>
                <p>Please check your Mapbox token and network connection.</p>
                <button 
                  onClick={retryMapInitialization}
                  style={{
                    background: 'var(--button-active)',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginTop: '10px'
                  }}
                >
                  Retry Loading Map
                </button>
              </>
            ) : (
              <p>Please wait while the map loads.</p>
            )}
          </div>
        )}
      </ErrorBoundary>
    </div>
  );
}

export default App;
