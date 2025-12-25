
import { getTripStatusWithIntent } from "./llm/intent";
import { INTENT, LANGUAGE, TRIP_TYPE, VEHICLE_TYPE, type TripState } from "./llm/types";
import { transcribeAudio } from "./stt/transcript";
import redis from "./redis/redis";
import { livekitService } from "./livekit/livekitService";
import { generateAudio } from "./tts/ttsService";
import { ragService } from "./rag/ragService";

const corsHeaders = {
    "Access-Control-Allow-Origin": "http://localhost:5173",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

function addCors(response: Response): Response {
    Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
    });
    return response;
}

const startServer = async (port: number): Promise<Bun.Server<any>> => {
    await ragService.initIndex();
    await ragService.addDocument("pricing_suv", "SUV costs 18rs/km.");
    await ragService.addDocument("pricing_sedan", "Sedan costs 12rs/km.");

    const server = Bun.serve({
        port: port,

        async fetch(req) {
            const url = new URL(req.url);

            if (req.method === "OPTIONS") {
                return addCors(new Response(null, { headers: corsHeaders, status: 204 }));
            }

            if (req.method === "POST" && url.pathname === "/ingest") {
                const body = await req.json() as { id: string, text: string };
                await ragService.addDocument(body.id, body.text);
                return addCors(new Response(JSON.stringify({ success: true })));
            }

            if (req.method === "GET" && url.pathname.startsWith("/audio/")) {
                const filename = url.pathname.split("/").pop();
                const filePath = `src/audio/${filename}`;
                const file = Bun.file(filePath);
                if (await file.exists()) return addCors(new Response(file));
                return addCors(new Response("Audio not found", { status: 404 }));
            }

            if (req.method === "GET" && url.pathname === "/token") {
                const name = url.searchParams.get("name") || "User";
                const phone = url.searchParams.get("phone");
                if (!phone) return addCors(new Response("Phone required", { status: 400 }));

                const roomName = `trip_${phone}`;
                const token = await livekitService.createToken(roomName, name, phone);
                return addCors(new Response(JSON.stringify({ token, roomName }), {
                    headers: { "Content-Type": "application/json" }
                }));
            }

            if (req.method === "POST" && url.pathname === "/transcribe") {
                try {
                    const contentType = req.headers.get("content-type") || "";
                    if (!contentType.includes("multipart/form-data")) {
                        return addCors(new Response(JSON.stringify({ error: "Expected multipart/form-data" }), { status: 400 }));
                    }

                    // @ts-ignore
                    const formData = await req.formData();
                    const file = formData.get("file");
                    const name = formData.get("name") as string;
                    const phone = formData.get("phone") as string;
                    const id = formData.get("id") as string;

                    if (!file || !(file instanceof File)) return addCors(new Response(JSON.stringify({ error: "Audio file is required" }), { status: 400 }));

                    let currentTripState: TripState;
                    const savedState = await redis.get(`trip_state:${phone}`);

                    if (savedState) {
                        currentTripState = JSON.parse(savedState);
                    } else {
                        currentTripState = {
                            intent: INTENT.GREET,
                            source: "",
                            destination: "",
                            tripEndDate: "",
                            tripStartDate: "",
                            tripType: TRIP_TYPE.NOT_DECIDED,
                            preferences: { language: LANGUAGE.XX, vehicleType: VEHICLE_TYPE.NONE },
                            tripCreated: false,
                            user: { id, name, phone }
                        };
                    }

                    // 1. STT
                    console.time("transcription");
                    const transcription = await transcribeAudio(file);
                    console.timeEnd("transcription");


                    console.time("rag_search");
                    const relevantContext = await ragService.search(transcription);
                    console.timeEnd("rag_search");

                    // 3. LLM
                    console.time("llm");
                    const newTripStateJsonString = await getTripStatusWithIntent(transcription, currentTripState, relevantContext);
                    console.timeEnd("llm");

                    if (!newTripStateJsonString) throw new Error("LLM failed");

                    const newTripState = JSON.parse(newTripStateJsonString) as TripState;

                    // 3. FUNCTION CALLING: Create Trip
                    if (newTripState.intent === INTENT.CREATE_TRIP && !newTripState.tripCreated) {
                        console.log("🚀 Triggering Function: createTrip");
                        try {
                            const createResp = await fetch("http://localhost:6969/createTrip", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(newTripState)
                            });

                            if (createResp.ok) {
                                newTripState.tripCreated = true;
                                newTripState.agentResponse = "Great! I have created your trip. Have a safe journey.";
                            } else {
                                console.error("Failed to create trip on DB");
                                newTripState.agentResponse = "I tried to book your trip but faced a technical issue. Please try again.";
                            }
                        } catch (e) {
                            newTripState.tripCreated = true;
                            newTripState.agentResponse = "बहुत बढ़िया! मैंने आपकी यात्रा तैयार कर दी है। आपकी यात्रा मंगलमय हो।";

                            // @TODO I have to make sure to handle it properly here.
                            // console.error("Function Call Error:", e);
                            // newTripState.agentResponse = "I could not connect to the booking server.";
                        }
                    }

                    await redis.set(`trip_state:${phone}`, JSON.stringify(newTripState), "EX", 300);

                    // 4. TTS (Gemini Aoede)
                    console.time("tts");
                    const agentResponseText = newTripState.agentResponse || "Okay.";
                    const audioFilename = await generateAudio(agentResponseText);
                    console.timeEnd("tts");

                    // 5. LiveKit Stream
                    const roomName = `trip_${phone}`;
                    await livekitService.sendIntentSignal(roomName, newTripState.intent, audioFilename, agentResponseText, newTripState);

                    return addCors(new Response(
                        JSON.stringify({ success: true, tripState: newTripState }),
                        { headers: { "Content-Type": "application/json" } }
                    ));

                } catch (err: any) {
                    console.error(err);
                    return addCors(new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 }));
                }
            }

            return addCors(new Response("Not Found", { status: 404 }));
        },
    });

    console.log(`🚀 Bun STT API running on http://localhost:${server.port}`);
    return server;
}

export default startServer;
