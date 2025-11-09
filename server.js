import express from 'express';
import SpotifyWebApi from 'spotify-web-api-node';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(express.json());

// Spotify Api setup
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});

// Middleware to refresh access token if expired
const refreshAccessToken = async () => {
  try {
    const data = await spotifyApi.refreshAccessToken();
    spotifyApi.setAccessToken(data.body.access_token);
  } catch (error) {
    console.error('refreshing Error token:', error);
  }
};

// Redirect user to Spotify to log in and allow access
app.get('/spotify/auth', (req, res) => {
  const scopes = ['user-top-read', 'user-read-currently-playing', 'user-modify-playback-state', 'user-follow-read'];
  const authorizeURL = spotifyApi.createAuthorizeURL(scopes);
  res.redirect(authorizeURL);
});

// After Spotify login, we come here to get the tokens
app.get('/spotify/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    spotifyApi.setAccessToken(data.body.access_token);
    spotifyApi.setRefreshToken(data.body.refresh_token);

    res.json({ message: ' Login successful! You can now use /spotify.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /spotify: Return top 10 tracks, now playing, and followed artists as JSON
app.get('/spotify', async (req, res) => {
  try {
    await refreshAccessToken(); // Ensure token is fresh
    const [topTracksRes, nowPlayingRes, followedArtistsRes] = await Promise.all([
      spotifyApi.getMyTopTracks({ limit: 10 }),
      spotifyApi.getMyCurrentPlayingTrack(),
      spotifyApi.getFollowedArtists({ limit: 50 }), // Adjust limit as needed
    ]);
    const topTracks = topTracksRes.body.items.map(track => ({
      id: track.id,
      name: track.name,
      artist: track.artists[0].name,
      uri: track.uri,
    }));
    const followedArtists = followedArtistsRes.body.artists.items.map(artist => ({
      id: artist.id,
      name: artist.name,
      uri: artist.uri,
    }));
    // Updated: Check for body AND item to avoid errors
    const nowPlaying = (nowPlayingRes.body && nowPlayingRes.body.item) ? {
      name: nowPlayingRes.body.item.name,
      artist: nowPlayingRes.body.item.artists[0].name,
      isPlaying: nowPlayingRes.body.is_playing,
    } : null;
    res.json({
      topTracks,
      nowPlaying,
      followedArtists,
      actions: {
        pause: 'PUT /spotify/pause',
        play: 'PUT /spotify/play/{trackId} (replace {trackId} with a track ID from topTracks)',
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /spotify/pause: Stop the currently playing song
app.get('/spotify/pause', async (req, res) => {
  try {
    await refreshAccessToken();
    await spotifyApi.pause();
    res.json({ message: 'Playback paused.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});





// PUT /spotify/play/:trackId: Start playing a top track
app.put('/spotify/play/:trackId', async (req, res) => {
  try {
    await refreshAccessToken();
    const track = await spotifyApi.getTrack(req.params.trackId);
    await spotifyApi.play({ uris: [track.body.uri] });
    res.json({ message: `Playing: ${track.body.name}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
