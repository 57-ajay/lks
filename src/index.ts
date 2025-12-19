import { getTripStatusWithIntent } from "./llm/intent";
import { INTENT, LANGUAGE, TRIP_TYPE, VEHICLE_TYPE, type TripState } from "./llm/types";
import { transcribeAudio } from "./stt/transcript";
import redis from "./redis/redis";
import { livekitService } from "./livekit/livekitService";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
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

    const server = Bun.serve({
        port: port,

        async fetch(req) {
            const url = new URL(req.url);

            if (req.method === "OPTIONS") {
                return addCors(new Response(null, {
                    headers: corsHeaders,
                    status: 204
                }));
            }

            if (req.method === "GET" && url.pathname.startsWith("/audio/")) {
                const filename = url.pathname.split("/").pop();
                const filePath = `src/audio/${filename}`;
                const file = Bun.file(filePath);

                if (await file.exists()) {
                    return addCors(new Response(file));
                }
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

                    if (!file || !(file instanceof File)) {
                        return addCors(new Response(JSON.stringify({ error: "Audio file is required" }), { status: 400 }));
                    }
                    if (!phone || !id || !name) {
                        return addCors(new Response(JSON.stringify({ error: "Phone number, id and name are required" }), { status: 400 }));
                    }

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
                            user: {
                                id: id,
                                name: name,
                                phone: phone,
                            }
                        };
                    }

                    // --- STT & LLM ---
                    console.time("transcription")
                    const transcription = await transcribeAudio(file);
                    console.timeEnd("transcription")
                    console.time("newTripStateJsonString")
                    const newTripStateJsonString = await getTripStatusWithIntent(transcription, currentTripState);
                    console.timeEnd("newTripStateJsonString")

                    if (!newTripStateJsonString) throw new Error("LLM failed");

                    const newTripState = JSON.parse(newTripStateJsonString);
                    await redis.set(`trip_state:${phone}`, JSON.stringify(newTripState), "EX", 300);


                    // --- TRIGGER LIVEKIT STREAMING ---
                    let audioFile = "general.mp3";
                    if (newTripState.intent === INTENT.ASK_DATE) audioFile = "ask_date.mp3";
                    else if (newTripState.intent === INTENT.ASK_SOURCE) audioFile = "ask_source.mp3";
                    else if (newTripState.intent === INTENT.ASK_DESTINATION) audioFile = "ask_destination.mp3";
                    else if (newTripState.intent === INTENT.ASK_TRIP_TYPE) audioFile = "ask_trip_type.mp3";
                    else if (newTripState.intent === INTENT.ASK_PREFERENCES) audioFile = "ask_price.mp3";

                    const roomName = `trip_${phone}`;
                    await livekitService.sendIntentSignal(roomName, newTripState.intent, audioFile);

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
