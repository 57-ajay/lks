# Cabswale AI Voice Agent

A LiveKit-based AI voice agent for cab booking with real-time audio processing, speech-to-text, and LLM-powered intent detection.

## Architecture

- **Backend**: Bun server (TypeScript) - handles STT, LLM, and trip state management
- **Frontend**: React + Vite + LiveKit Client - real-time voice interaction UI
- **LiveKit**: Real-time audio streaming and signaling
- **Redis**: Trip state storage
- **Google Cloud Vertex AI**: Speech-to-Text and LLM processing

## Prerequisites

- [Bun](https://bun.sh) v1.2.10+
- [Docker](https://www.docker.com/) & Docker Compose
- Google Cloud account with Vertex AI API enabled
- Google Cloud service account key JSON file

## Quick Start

### 1. Start Required Services (LiveKit & Redis)

```bash
# Stop any existing containers
docker stop cabswale-livekit cabswale-redis 2>/dev/null || true
docker rm cabswale-livekit cabswale-redis 2>/dev/null || true

# Start services with Docker Compose
docker-compose up -d

# Verify services are running
docker-compose ps
```

**Services started:**
- LiveKit Server: `http://localhost:7880`
- Redis: `localhost:6379`
- RedisInsight UI: `http://localhost:8001`

### 2. Configure Environment Variables

```bash
# Copy example env file
cp .env.example .env

# Edit .env and add your Google Cloud credentials
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account-key.json
# GOOGLE_CLOUD_PROJECT=your-project-id
```

### 3. Setup Backend Server

```bash
# Install dependencies
bun install

# Run the backend server
bun run index.ts
```

Backend API will start on `http://localhost:3000`

**Available endpoints:**
- `GET /token?name=<name>&phone=<phone>` - Get LiveKit token
- `POST /transcribe` - Upload audio for transcription & processing
- `GET /audio/<filename>` - Serve audio responses

### 4. Setup Frontend Client

```bash
# Navigate to client directory
cd client

# Install dependencies
bun install

# Start development server
bun run dev
```

Frontend will start on `http://localhost:5173` (or next available port)

### 5. Test the Application

1. Open `http://localhost:5173` in your browser
2. Grant microphone permissions when prompted
3. Wait for "Ready. Press Mic to Speak." status
4. Click the microphone button to start recording
5. Speak your cab booking request (e.g., "I want to go from Mumbai to Pune tomorrow")
6. Click stop button
7. The agent will respond with audio based on detected intent

## Development

### Backend Commands

```bash
# Development mode
bun run dev

# Build for production
bun run build

# Run production build
bun run start

# Watch mode (auto-reload)
bun run watch
```

### Frontend Commands

```bash
cd client

# Development
bun run dev

# Build
bun run build

# Preview production build
bun run preview

# Lint
bun run lint
```

## Docker Compose Commands

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f livekit
docker-compose logs -f redis

# Restart services
docker-compose restart

# Remove all containers and volumes
docker-compose down -v
```

## Testing the Flow

### 1. Verify Services Health

```bash
# Check LiveKit
curl http://localhost:7880
# Expected: OK

# Check Backend
curl "http://localhost:3000/token?name=TestUser&phone=1234567890"
# Expected: JSON with token and roomName

# Check Redis
docker exec cabswale-redis redis-cli ping
# Expected: PONG
```

### 2. Monitor Logs During Testing

Open 3 terminal windows:

```bash
# Terminal 1: LiveKit logs
docker-compose logs -f livekit

# Terminal 2: Backend logs
bun run index.ts

# Terminal 3: Frontend
cd client && bun run dev
```

### 3. Test Trip Booking Flow

The agent recognizes these intents:
- `GREET` - Initial greeting
- `ASK_SOURCE` - Request source location
- `ASK_DESTINATION` - Request destination
- `ASK_DATE` - Request trip dates
- `ASK_TRIP_TYPE` - One-way or round trip
- `ASK_PREFERENCES` - Vehicle type and language preferences

## Troubleshooting

### LiveKit Connection Fails

**Error:** `could not establish pc connection`

**Solution:**
```bash
# Restart LiveKit with proper configuration
docker-compose down
docker-compose up -d livekit

# Check logs for ICE connection errors
docker-compose logs livekit | grep -i "ice\|error"
```

### Redis Connection Issues

**Error:** `Redis connection refused`

**Solution:**
```bash
# Verify Redis is running
docker-compose ps redis

# Test connection
docker exec cabswale-redis redis-cli ping

# Restart if needed
docker-compose restart redis
```

### Audio Not Playing

**Solution:**
1. Check audio files exist in `src/audio/`
2. Verify backend is serving audio: `curl http://localhost:3000/audio/general.mp3`
3. Check browser console for CORS errors
4. Ensure browser allows audio autoplay

### STT/LLM Errors

**Error:** `Google Cloud authentication failed`

**Solution:**
1. Verify `GOOGLE_APPLICATION_CREDENTIALS` path in `.env`
2. Check service account has Vertex AI permissions
3. Verify project ID is correct
4. Test credentials: `gcloud auth application-default print-access-token`

## Project Structure

```
.
├── src/                    # Backend source
│   ├── audio/             # Audio response files
│   ├── livekit/           # LiveKit service
│   ├── llm/               # LLM & intent detection
│   ├── redis/             # Redis client
│   ├── stt/               # Speech-to-text
│   └── index.ts           # Main server
├── client/                 # Frontend React app
│   ├── src/
│   │   ├── App.tsx        # Main component
│   │   └── main.tsx       # Entry point
│   └── package.json
├── docker-compose.yml      # Service orchestration
├── .env.example           # Environment template
└── package.json           # Backend dependencies
```

## Production Deployment

For production deployment, consider:

1. **LiveKit**: Use managed LiveKit Cloud or self-host with proper domain/SSL
2. **TURN/STUN**: Configure proper TURN servers for NAT traversal
3. **Redis**: Use Redis cluster or managed service
4. **Environment**: Use production credentials and proper secrets management
5. **Monitoring**: Add logging, metrics, and error tracking

## License

This project was created using `bun init` in bun v1.2.10. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
