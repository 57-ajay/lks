import { handleOptions, createError } from "./utils/http";
import { handleToken } from "./controllers/auth.controller";
import { handleAudio } from "./controllers/audio.controller";
import { handleIngest } from "./controllers/rag.controller";
import { handleTranscribe } from "./controllers/trip.controller";

export const router = async (req: Request) => {
    const url = new URL(req.url);

    // 1. Global Middleware (CORS Preflight)
    if (req.method === "OPTIONS") return handleOptions();

    // 2. Route Dispatcher
    // Route: GET /audio/*
    if (req.method === "GET" && url.pathname.startsWith("/audio/")) {
        return handleAudio(req, url);
    }

    // Route: GET /token
    if (req.method === "GET" && url.pathname === "/token") {
        return handleToken(req, url);
    }

    // Route: POST /ingest
    if (req.method === "POST" && url.pathname === "/ingest") {
        return handleIngest(req);
    }

    // Route: POST /transcribe
    if (req.method === "POST" && url.pathname === "/transcribe") {
        return handleTranscribe(req);
    }

    // 404 Fallback
    return createError("Not Found", 404);
};
