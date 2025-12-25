import { createResponse, createError } from "../utils/http";
import { INTENT, LANGUAGE, TRIP_TYPE, VEHICLE_TYPE, type TripState } from "../llm/types";
import { transcribeAudio } from "../stt/transcript";
import redis from "../redis/redis";
import { livekitService } from "../livekit/livekitService";
import { generateAudio } from "../tts/ttsService";
import { ragService } from "../rag/ragService";
import { getTripStatusWithIntent } from "../llm/intent";

export const handleTranscribe = async (req: Request) => {
    try {
        const contentType = req.headers.get("content-type") || "";
        if (!contentType.includes("multipart/form-data")) {
            return createError("Expected multipart/form-data", 400);
        }

        // @ts-ignore
        const formData = await req.formData();
        const file = formData.get("file");
        const name = formData.get("name") as string;
        const phone = formData.get("phone") as string;
        const id = formData.get("id") as string;

        if (!file || !(file instanceof File)) return createError("Audio file is required");

        // 1. Fetch State
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

        // 2. STT
        console.time("transcription");
        const transcription = await transcribeAudio(file);
        console.timeEnd("transcription");

        // 3. RAG Search
        console.time("rag_search");
        const relevantContext = await ragService.search(transcription);
        console.timeEnd("rag_search");

        // 4. LLM Processing
        console.time("llm");
        const newTripStateJsonString = await getTripStatusWithIntent(transcription, currentTripState, relevantContext);
        console.timeEnd("llm");

        if (!newTripStateJsonString) throw new Error("LLM failed to generate valid JSON");

        const newTripState = JSON.parse(newTripStateJsonString) as TripState;

        // 5. Function Call (Create Trip)
        if (newTripState.intent === INTENT.CREATE_TRIP && !newTripState.tripCreated) {
            console.log("Triggering Function: createTrip");
            try {
                const createResp = await fetch("http://localhost:6969/createTrip", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(newTripState)
                });

                if (createResp.ok) {
                    newTripState.tripCreated = true;
                    if (!newTripState.agentResponse) {
                        newTripState.agentResponse = "Great! I have created your trip. Have a safe journey.";
                    }
                } else {
                    console.error("Failed to create trip on DB");
                    newTripState.agentResponse = "I tried to book your trip but faced a technical issue. Please try again.";
                }
            } catch (e) {
                console.warn("Booking server unreachable. Proceeding with demo mock.");
                newTripState.tripCreated = true;
                newTripState.agentResponse = "बहुत बढ़िया! मैंने आपकी यात्रा तैयार कर दी है। आपकी यात्रा मंगलमय हो।";
            }
        }

        // 6. Save State
        await redis.set(`trip_state:${phone}`, JSON.stringify(newTripState), "EX", 300);

        // 7. TTS
        console.time("tts");
        const agentResponseText = newTripState.agentResponse || "Okay.";
        const audioFilename = await generateAudio(agentResponseText);
        console.timeEnd("tts");

        // 8. LiveKit Signal
        const roomName = `trip_${phone}`;
        await livekitService.sendIntentSignal(roomName, newTripState.intent, audioFilename, agentResponseText, newTripState);

        return createResponse({ success: true, tripState: newTripState });

    } catch (err: any) {
        console.error(err);
        return createResponse({ success: false, error: err.message }, 500);
    }
};
