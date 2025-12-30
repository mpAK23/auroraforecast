const THREE_DAY_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json';
const TWENTY_SEVEN_DAY_URL = 'https://services.swpc.noaa.gov/text/27-day-outlook.txt';

const ctx = document.getElementById('auroraChart').getContext('2d');
const loadingIndicator = document.getElementById('loading');
const errorMsg = document.getElementById('error');
const btn3Day = document.getElementById('btn-3day');
const btn27Day = document.getElementById('btn-27day');

let chart;
let raw3DayData = null; // Store raw entries
let threeDayData = null; // Processed data for chart
let twentySevenDayData = null;
let currentMode = '3day'; // '3day' or '27day'
let currentTimezone = 'UTC';

const timezoneSelector = document.getElementById('timezone-selector');

// --- Utility Functions ---

function process3DayData(rawData, timezone) {
    if (!rawData) return null;

    const labels = [];
    const dataPoints = [];

    rawData.forEach(entry => {
        // entry[0] is time_tag "YYYY-MM-DD HH:MM:SS"
        // entry[1] is kp (string)

        const dateObj = new Date(entry[0] + 'Z'); // Treat as UTC

        // Format options for the selected timezone
        const options = {
            timeZone: timezone,
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        };

        // Getting date and time parts. 
        // Note: toLocaleString returns "Dec 30, 24:00" or similar depending on browser, 
        // but we want a clean split.

        const formatter = new Intl.DateTimeFormat('en-US', options);
        const parts = formatter.formatToParts(dateObj);

        // Extract parts safely
        const month = parts.find(p => p.type === 'month').value;
        const day = parts.find(p => p.type === 'day').value;
        const hour = parts.find(p => p.type === 'hour').value;
        const minute = parts.find(p => p.type === 'minute').value;

        labels.push(`${month} ${day}\n${hour}:${minute}`);
        dataPoints.push(parseFloat(entry[1]));
    });

    return { labels, dataPoints };
}

function getKpColor(kp) {
    if (kp >= 5) return '#ff3333'; // Red - Storm
    if (kp >= 4) return '#ffcc00'; // Orange/Yellow - Active
    return '#39ff14'; // Green - Quiet
}

function showError(message) {
    errorMsg.innerText = message;
    errorMsg.style.display = 'block';
    loadingIndicator.style.display = 'none';
}

// --- Data Fetching & Parsing ---

async function fetch3DayForecast() {
    try {
        const response = await fetch(THREE_DAY_URL);
        if (!response.ok) throw new Error('Failed to load 3-day forecast');
        const rawData = await response.json();

        // Store raw data for reprocessing
        raw3DayData = [];
        for (let i = 1; i < rawData.length; i++) {
            // entry[2] is status ("observed", "estimated", "predicted")
            if (rawData[i][2] !== 'observed') {
                raw3DayData.push(rawData[i]);
            }
        }

        return process3DayData(raw3DayData, currentTimezone);

    } catch (err) {
        console.error(err);
        showError('Error fetching 3-Day Forecast: ' + err.message);
        return null;
    }
}

async function fetch27DayForecast() {
    try {
        const response = await fetch(TWENTY_SEVEN_DAY_URL);
        if (!response.ok) throw new Error('Failed to load 27-day forecast');
        const textData = await response.text();

        // Parse Text File
        // Format: Date (3 cols) | Radio Flux | Planetary A | Largest Kp
        // 2025 Dec 29     185           5          2

        const lines = textData.split('\n');
        const labels = [];
        const dataPoints = [];

        lines.forEach(line => {
            // Trim and verify it starts with a year number (e.g. "202")
            // This skips headers and comments
            const trimmed = line.trim();
            if (!trimmed.match(/^\d{4}/)) return;

            // Split by whitespace
            const parts = trimmed.split(/\s+/);

            if (parts.length >= 6) {
                // correct index might vary slightly depending on splitting empty strings, 
                // but usually: Year(0) Month(1) Day(2) Flux(3) A-Index(4) Kp(5)

                const dateLabel = `${parts[1]} ${parts[2]}`; // "Dec 29"
                const kp = parseInt(parts[5], 10);

                labels.push(dateLabel);
                dataPoints.push(kp);
            }
        });

        return { labels, dataPoints };

    } catch (err) {
        console.error(err);
        showError('Error fetching 27-Day Forecast: ' + err.message);
        return null;
    }
}

// --- Chart Logic ---

function initChart() {
    chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Kp Index',
                data: [],
                backgroundColor: [], // Dynamic colors
                borderWidth: 0,
                borderRadius: 4,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 9, // Kp max is 9
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#a0a0c0'
                    },
                    title: {
                        display: true,
                        text: 'Kp Index',
                        color: '#a0a0c0'
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#a0a0c0',
                        maxRotation: 45,
                        minRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    callbacks: {
                        label: function (context) {
                            return `Kp Value: ${context.parsed.y}`;
                        }
                    }
                }
            }
        }
    });
}

function updateChart(data) {
    if (!data) return;

    chart.data.labels = data.labels;
    chart.data.datasets[0].data = data.dataPoints;

    // Assign colors dynamically based on value
    chart.data.datasets[0].backgroundColor = data.dataPoints.map(val => getKpColor(val));

    chart.update();
}

// --- App Control ---

async function loadData() {
    loadingIndicator.style.display = 'block';

    // Fetch both in parallel
    const [d3, d27] = await Promise.all([fetch3DayForecast(), fetch27DayForecast()]);

    threeDayData = d3;
    twentySevenDayData = d27;

    loadingIndicator.style.display = 'none';

    // Initial Render
    if (currentMode === '3day' && threeDayData) {
        updateChart(threeDayData);
    } else {
        // Fallback
        showError('Could not load forecast data.');
    }
}

function switchMode(mode) {
    currentMode = mode;

    if (mode === '3day') {
        btn3Day.classList.add('active');
        btn27Day.classList.remove('active');
        updateChart(threeDayData);
    } else {
        btn3Day.classList.remove('active');
        btn27Day.classList.add('active');
        updateChart(twentySevenDayData);
    }
}

// --- Initialization ---

initChart();
loadData();

btn3Day.addEventListener('click', () => switchMode('3day'));
btn27Day.addEventListener('click', () => switchMode('27day'));
timezoneSelector.addEventListener('change', (e) => {
    currentTimezone = e.target.value;
    // Re-process data with new timezone
    if (raw3DayData) {
        threeDayData = process3DayData(raw3DayData, currentTimezone);
        if (currentMode === '3day') {
            updateChart(threeDayData);
        }
    }
});
