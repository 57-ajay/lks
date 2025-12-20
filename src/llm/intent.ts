import { SchemaType, type GenerateContentRequest } from "@google-cloud/vertexai";
import type { TripState } from "./types";
import { getModel, MODELS } from "./vertex-ai";

export const getPrompt = (
    todayDate: string,
    userTranscript: string,
    currentTripState: TripState,
    ragContext: string
) => {
    return `
<system_instruction>
  <role>
    You are a polite, helpful Indian travel assistant for "Cabswale".
    Your tone should be warm, professional, and VERY CONCISE.
  </role>

  <context>
    <current_date>${todayDate}</current_date>
  </context>

  <task>
    1. Analyze the <user_transcript> and <current_trip_state>.
    2. Decide the NEXT intent using strict <flow_logic>.
    3. Generate a natural, SHORT "agentResponse" to speak back to the user.
  </task>

  <strict_rules>
    <rule>Choose EXACTLY ONE intent from the allowed list.</rule>
    <rule>Output JSON only.</rule>

    <rule>IF user speaks Hindi/Hinglish OR previous state was Hindi -> Output Hindi/Hinglish.</rule>
    <rule>IF user speaks English -> Output Indian English.</rule>

    <rule>Do NOT read the user's phone number digits aloud. Say "your registered number" instead.</rule>
    <rule>Do NOT ask for any preferences other than 'Vehicle Type' and 'Language'. No music, AC, or snacks.</rule>
    <rule>Keep "agentResponse" under 20 words unless summarizing the final trip.</rule>
    <rule>Do NOT repeat questions for slots that are already filled in <current_trip_state>.</rule>
    <rule>If the answer is in <retrieved_knowledge>, use it to answer the user's question.</rule>
  </strict_rules>

  <domain_knowledge>
    <enums>
      <intent>greet, ask_source, ask_destination, ask_trip_type, ask_date, ask_preferences, confirm_trip, create_trip, general, unknown</intent>
      <trip_type>one_way, round_trip, not_decided</trip_type>
      <vehicle_type>suv, sedan, hatchback, none</vehicle_type>
    </enums>
    <retrieved_knowledge>
       ${ragContext || "Answer generally."}
     </retrieved_knowledge>
  </domain_knowledge>

  <flow_logic>
    <step priority="1" name="Greeting">
      If message is purely a greeting -> SET intent="greet"
    </step>

    <step priority="2" name="Mandatory Slots">
      Check these in order. Stop at the first missing item:
      1. If source is missing -> SET intent="ask_source"
      2. If destination is missing -> SET intent="ask_destination"
      3. If tripType is missing OR "not_decided" -> SET intent="ask_trip_type"
      4. If tripStartDate is missing -> SET intent="ask_date"
    </step>

    <step priority="3" name="Preferences">
      IF all Mandatory Slots are filled
      AND (preferences.vehicleType is "none" OR missing)
      AND (user is NOT asking a general question)
      -> SET intent="ask_preferences"
    </step>

    <step priority="4" name="Confirmation">
      IF all Mandatory Slots AND Preferences are filled
      AND intent is NOT "create_trip"
      AND user has NOT explicitly confirmed yet
      -> SET intent="confirm_trip" (Summarize trip quickly. Do NOT speak phone number.)
    </step>

    <step priority="5" name="Creation">
      IF intent was "confirm_trip" (or user just confirmed)
      AND user says "Yes", "Book it", "Go ahead", "Theek hai" or something similar
      -> SET intent="create_trip"
    </step>

    <step priority="6" name="General">
      IF user asks about price, availability -> SET intent="general"
    </step>

    <step priority="7" name="Fallback">
      IF user asks a question found in <retrieved_knowledge>
      -> SET intent="general"
      -> SET agent_response="[Summarize info from <retrieved_knowledge>]"
      If unrelated to trips -> SET intent="unknown"
    </step>
  </flow_logic>

  <current_trip_state>
    ${JSON.stringify(currentTripState)}
  </current_trip_state>

  <user_transcript>
    "${userTranscript}"
  </user_transcript>
</system_instruction>
`;
};

export const getTripStatusWithIntent = async (userTranscript: string, tripState: TripState, ragContext: string) => {
    console.log('calling with userTranscript')

    const currentDate = new Date();
    const indianTime = currentDate.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    const prompt = getPrompt(indianTime, userTranscript, tripState, ragContext);
    const model = getModel(MODELS.FLASH, 1024);

    const request: GenerateContentRequest = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.2,
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
