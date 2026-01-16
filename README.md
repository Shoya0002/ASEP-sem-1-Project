# Elite Sports Hub - Sports Tracker & Schedule Dashboard

This project is a simple sports matches & schedule tracker with a modern UI and a small Node.js/Express backend.

It powers:

- My Schedule (per-sport/team schedule and countdown)
- Global Events (searchable, filterable by year)
- Statistics (per-sport match counts)
- Notifications for upcoming matches based on the sports/teams you follow

## Getting Started

### 1. Install Dependencies

From the project root (where `package.json` and `server.js` live):

```bash
npm install
```

### 2. Configure Sports API (Optional)

By default, the app uses mock data. To use a real sports API:

1. **Get an API key** from one of these providers:
   - **API-Sports** (recommended): Sign up at [api-sports.io](https://www.api-sports.io/) - Free tier available
   - **Sportmonks**: Sign up at [sportmonks.com](https://www.sportmonks.com/) - Free plan available

2. **Create a `.env` file** in the project root:

```env
# Sports API Configuration
SPORTS_API_PROVIDER=api-sports
SPORTS_API_KEY=your_api_key_here
SPORTS_API_BASE_URL=https://v3.football.api-sports.io
PORT=3000
```

**Note**: If you don't create a `.env` file or don't set `SPORTS_API_KEY`, the app will automatically use mock data (perfect for testing).

### 3. Run the Server

```bash
npm start
```

This starts the Express server on `http://localhost:3000`.

The server:

- Serves `Dashboard.html` and `main.js` as static files
- Exposes REST APIs under `/api/...` for sports, schedules, global events, stats, preferences, and notifications
- Uses real sports API data if configured, otherwise falls back to mock data

### 3. Open the Dashboard

In your browser, go to:

```text
http://localhost:3000/Dashboard.html
```

You should see the Elite Sports Hub UI.

## How It Works

- The dashboard calls `/api/sports` on load to populate the sports and team dropdowns.
- Your selection and subscription are stored via `/api/preferences` and also saved in `localStorage`.
- `Show Schedule` fetches from `/api/schedule` and renders a table plus a live countdown to the next upcoming match.
- The Global Events tab is powered by `/api/events/global` with search and year filters.
- The Statistics tab calls `/api/stats` and renders simple stat cards and a mini performance bar view.
- When you click `Subscribe`, the browser:
  - Saves your sport/team selection
  - Requests notification permission (if not already granted/denied)
  - Starts a polling loop that hits `/api/notifications/upcoming` every 60 seconds
  - Shows browser notifications where allowed, otherwise in-page toast notifications

## API Integration

The backend uses a modular API client (`server/services/sportsApiClient.js`) that:

- Supports multiple API providers (API-Sports, Sportmonks, or mock)
- Automatically falls back to mock data if API calls fail or no API key is configured
- Caches sports data and matches to reduce API calls
- Transforms API responses to a consistent format for the frontend

### Using Real Sports APIs

**API-Sports Integration:**
- Sign up at [api-sports.io](https://www.api-sports.io/)
- Get your API key from the RapidAPI dashboard
- Set `SPORTS_API_PROVIDER=api-sports` and `SPORTS_API_KEY=your_key` in `.env`
- The API client will fetch real fixtures, schedules, and match data

**Sportmonks Integration:**
- Sign up at [sportmonks.com](https://www.sportmonks.com/)
- Get your API token
- Set `SPORTS_API_PROVIDER=sportmonks` and `SPORTS_API_KEY=your_token` in `.env`

The current implementation includes the structure for both providers. You may need to adjust the API endpoints in `server/services/sportsApiClient.js` based on the specific API documentation.

## Notes

- By default, the app uses mock data (no API key required for testing)
- Times are stored in UTC and formatted on the client according to the timezone dropdown (Local, UTC, EST, PST)
- Removing or clearing browser storage will reset your client id and stored preferences
- API responses are cached to minimize API calls and respect rate limits

