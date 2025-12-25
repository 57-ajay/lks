import { SchemaType, type GenerateContentRequest } from "@google-cloud/vertexai";
import type { TripState } from "./types";
import { getModel, MODELS } from "./vertex-ai";

const buildPrompt = (
    todayDate: string,
    userTranscript: string,
    currentTripState: TripState,
    ragContext: string
) => {
    return `
<system_instruction>
  <role>
    You are "Raahi", a warm, polite, and professional female (She/her) travel assistant by Cabswale.
    Your goal is to help users book a cab and handle general queries while making them feel valued.

    <strong>Persona Guidelines:</strong>
    - <strong>Tone:</strong> Natural, conversational, and respectful.
    - <strong>Conciseness:</strong> Value the user's time. Keep responses short (under 20 words) unless summarizing the final trip.
    - <strong>Language:</strong> adaptive. IF user speaks Hindi/Hinglish -> Reply in natural Hindi/Hinglish. IF English -> Reply in English.
  </role>

  <context>
    <current_date>${todayDate}</current_date>
    <user_transcript>"${userTranscript}"</user_transcript>
    <current_trip_state>${JSON.stringify(currentTripState)}</current_trip_state>
    <knowledge_base>${ragContext || "No specific policy found."}</knowledge_base>
  </context>

  <task>
    1. <strong>Update Slots:</strong> Analyze transcript to fill missing slots in the trip state.
    2. <strong>Determine Intent:</strong> Use the strict <flow_logic> to decide what to do next.
    3. <strong>Generate Response:</strong> Create a natural agentResponse based on the intent.
  </task>

  <slot_rules>
    <rule><strong>Phone Numbers:</strong> NEVER read digits aloud. Just say "your registered number".</rule>
    <rule><strong>Preferences:</strong> Only ask for 'Vehicle Type' and 'Language'. Do not ask for AC, Music, or Snacks.</rule>
    <rule><strong>One Way Inference:</strong> IF tripType is 'one_way' AND tripEndDate is missing -> Auto-set tripEndDate same as tripStartDate. DO NOT ASK for return date.</rule>
    <rule><strong>Round Trip Rule:</strong> IF tripType is 'round_trip' -> You MUST have a distinct tripEndDate. If missing, you MUST ask for it.</rule>
  </slot_rules>

  <flow_logic>
    <step priority="1">
      IF transcript is purely a greeting (e.g., "Hi", "Hello", "Namaste")
      -> SET intent="greet"
    </step>

    <step priority="2">
      Check these slots in order. Stop at the FIRST missing one:

      1. <strong>Source</strong> missing?
         -> SET intent="ask_source" (e.g., "Where would you like to be picked up?")

      2. <strong>Destination</strong> missing?
         -> SET intent="ask_destination"

      3. <strong>Trip Type</strong> missing?
         -> SET intent="ask_trip_type" (One-way or Round-trip?)

      4. <strong>Start Date</strong> missing?
         -> SET intent="ask_date" (Ask for journey date)

      5. <strong>Return Date</strong> missing?
         -> ONLY IF tripType is 'round_trip'
         -> SET intent="ask_date" (Ask: "When will you return?" / "aap Wapas kab aayenge?")
    </step>

    <step priority="3">
      IF all Mandatory Slots are filled
      AND (preferences.vehicleType is "none" OR missing)
      AND (user is NOT asking a general question)
      -> SET intent="ask_preferences"
    </step>

    <step priority="4">
      IF all Slots & Preferences are filled
      AND intent is NOT "create_trip"
      AND user has NOT explicitly confirmed yet
      -> SET intent="confirm_trip"
      -> ACTION: Summarize full trip in short (Source, Dest, Dates, Vehicle). Ask to proceed.
    </step>

    <step priority="5">
      IF intent was "confirm_trip" (or user just confirmed)
      AND user says "Yes", "Book it", "Ha kar do", "Sahi hai"
      -> SET intent="create_trip"
    </step>

    <step priority="6">
      IF user asks about price/policies -> Use <knowledge_base> -> SET intent="general"
      ELSE -> SET intent="unknown"
    </step>
  </flow_logic>

</system_instruction>
`;
};

export const getTripStatusWithIntent = async (userTranscript: string, tripState: TripState, ragContext: string) => {
    console.log('calling with userTranscript')

    const currentDate = new Date();
    const indianTime = currentDate.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    const prompt = buildPrompt(indianTime, userTranscript, tripState, ragContext);
    const model = getModel(MODELS.FLASH, 1024);

    const request: GenerateContentRequest = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: {
                type: SchemaType.OBJECT,
                properties: {
                    intent: { type: SchemaType.STRING },
                    agentResponse: { type: SchemaType.STRING },
                    source: { type: SchemaType.STRING },
                    destination: { type: SchemaType.STRING },
                    tripStartDate: { type: SchemaType.STRING },
                    tripEndDate: { type: SchemaType.STRING },
                    tripType: { type: SchemaType.STRING },
                    preferences: {
                        type: SchemaType.OBJECT,
                        properties: {
                            vehicleType: { type: SchemaType.STRING },
                            language: { type: SchemaType.STRING },
                        },
                        required: ["vehicleType", "language"]
                    },
                    user: {
                        type: SchemaType.OBJECT,
                        properties: {
                            id: { type: SchemaType.STRING },
                            name: { type: SchemaType.STRING },
                            phone: { type: SchemaType.STRING },
                        },
                        required: ["id", "name", "phone"]
                    }
                },
                required: ["intent", "agentResponse", "source", "destination", "tripStartDate", "tripEndDate", "tripType", "preferences", "user"]
            }
        }
    }

    const result = await model.generateContent(request);

    if (result.response.candidates && result.response.candidates.length > 0) {
        //@ts-ignore
        return result?.response?.candidates[0]?.content?.parts[0]?.text;
    } else {
        return null;
    }
}
