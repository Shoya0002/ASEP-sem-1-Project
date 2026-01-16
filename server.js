require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const sportsApi = require('./server/services/sportsApiClient');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files (Dashboard.html and main.js) from project root
const publicDir = __dirname;
app.use(express.static(publicDir));

// In-memory cache for matches (to avoid excessive API calls)
let matchesCache = [];
let matchesCacheTime = null;
const MATCHES_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Simple in-memory preferences store keyed by clientId
const preferencesStore = {};

// API: get sports and teams
app.get('/api/sports', async (req, res) => {
  try {
    const sportsData = await sportsApi.getSportsList();
    res.json(sportsData);
  } catch (error) {
    console.error('Error fetching sports:', error);
    res.status(500).json({ error: 'Failed to fetch sports data' });
  }
});

// API: schedule
app.get('/api/schedule', async (req, res) => {
  try {
    const { sport, team, date } = req.query;
    
    if (!sport) {
      return res.status(400).json({ error: 'sport parameter is required' });
    }

    const matches = await sportsApi.getSchedule({ sport, team, date });
    
    // Filter matches if needed (additional client-side filtering)
    let filtered = matches;
    if (team) {
      filtered = filtered.filter(
        m => m.homeTeam === team || m.awayTeam === team
      );
    }
    if (date) {
      const dateOnly = new Date(date).toISOString().substring(0, 10);
      filtered = filtered.filter(
        m => m.startTimeUtc && m.startTimeUtc.substring(0, 10) === dateOnly
      );
    }

    // Cache matches for notifications endpoint
    matchesCache = filtered;
    matchesCacheTime = Date.now();

    res.json(filtered);
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// API: global events
app.get('/api/events/global', async (req, res) => {
  try {
    const { year, search } = req.query;
    const events = await sportsApi.getGlobalEvents({ year, search });
    res.json(events);
  } catch (error) {
    console.error('Error fetching global events:', error);
    res.status(500).json({ error: 'Failed to fetch global events' });
  }
});

// API: stats
app.get('/api/stats', async (req, res) => {
  try {
    // Use cached matches if available, otherwise fetch fresh data
    let allMatches = matchesCache;
    
    if (!allMatches || !matchesCacheTime || (Date.now() - matchesCacheTime) > MATCHES_CACHE_DURATION) {
      // Fetch matches for all sports
      const sportsData = await sportsApi.getSportsList();
      allMatches = [];
      
      for (const sport of Object.keys(sportsData)) {
        try {
          const sportMatches = await sportsApi.getSchedule({ sport });
          allMatches = allMatches.concat(sportMatches);
        } catch (err) {
          console.error(`Error fetching matches for ${sport}:`, err);
        }
      }
      
      matchesCache = allMatches;
      matchesCacheTime = Date.now();
    }

    const statsBySport = {};
    allMatches.forEach(m => {
      if (!statsBySport[m.sport]) {
        statsBySport[m.sport] = {
          sport: m.sport,
          totalMatches: 0,
          upcoming: 0,
          live: 0,
          completed: 0
        };
      }
      const s = statsBySport[m.sport];
      s.totalMatches += 1;
      if (m.status === 'upcoming') s.upcoming += 1;
      else if (m.status === 'live') s.live += 1;
      else s.completed += 1;
    });

    res.json({
      statsBySport: Object.values(statsBySport)
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// API: preferences
app.post('/api/preferences', (req, res) => {
  const { clientId, sports, teams, notificationsEnabled } = req.body || {};
  if (!clientId) {
    return res.status(400).json({ error: 'clientId is required' });
  }
  preferencesStore[clientId] = {
    sports: sports || [],
    teams: teams || [],
    notificationsEnabled: !!notificationsEnabled,
    updatedAt: new Date().toISOString()
  };
  res.json(preferencesStore[clientId]);
});

app.get('/api/preferences', (req, res) => {
  const { clientId } = req.query;
  if (!clientId || !preferencesStore[clientId]) {
    return res.json({
      sports: [],
      teams: [],
      notificationsEnabled: false
    });
  }
  res.json(preferencesStore[clientId]);
});

// API: upcoming notifications
app.get('/api/notifications/upcoming', async (req, res) => {
  try {
    const { sports, teams, windowMinutes } = req.query;
    const now = Date.now();
    const windowMs = (parseInt(windowMinutes, 10) || 120) * 60 * 1000; // Default 2 hours

    let sportsArr = [];
    if (typeof sports === 'string' && sports.length > 0) {
      sportsArr = sports.split(',');
    }

    let teamsArr = [];
    if (typeof teams === 'string' && teams.length > 0) {
      teamsArr = teams.split(',');
    }

    // Fetch matches for requested sports
    let allMatches = [];
    if (sportsArr.length > 0) {
      for (const sport of sportsArr) {
        try {
          const sportMatches = await sportsApi.getSchedule({ sport, team: null, date: null });
          allMatches = allMatches.concat(sportMatches);
        } catch (err) {
          console.error(`Error fetching matches for ${sport}:`, err);
        }
      }
    } else {
      // If no sports specified, use cached matches or fetch all
      if (matchesCache && matchesCacheTime && (Date.now() - matchesCacheTime) < MATCHES_CACHE_DURATION) {
        allMatches = matchesCache;
      } else {
        const sportsData = await sportsApi.getSportsList();
        for (const sport of Object.keys(sportsData)) {
          try {
            const sportMatches = await sportsApi.getSchedule({ sport });
            allMatches = allMatches.concat(sportMatches);
          } catch (err) {
            console.error(`Error fetching matches for ${sport}:`, err);
          }
        }
      }
    }

    const upcoming = allMatches.filter(m => {
      if (!m.startTimeUtc) return false;
      const startMs = new Date(m.startTimeUtc).getTime();
      if (startMs < now) return false; // only upcoming
      if (startMs > now + windowMs) return false;

      if (sportsArr.length && !sportsArr.includes(m.sport)) return false;

      if (
        teamsArr.length &&
        !teamsArr.includes(m.homeTeam) &&
        !teamsArr.includes(m.awayTeam)
      ) {
        return false;
      }

      return true;
    });

    res.json(upcoming);
  } catch (error) {
    console.error('Error fetching upcoming notifications:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming matches' });
  }
});

// Fallback route to serve Dashboard.html
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'Dashboard.html'));
});

app.listen(PORT, () => {
  console.log(`Elite Sports Hub server running on http://localhost:${PORT}`);
  console.log(`API Provider: ${process.env.SPORTS_API_PROVIDER || 'mock'}`);
  if (process.env.SPORTS_API_KEY) {
    console.log('Real sports API enabled');
  } else {
    console.log('Using mock data (set SPORTS_API_KEY in .env to use real API)');
  }
});

