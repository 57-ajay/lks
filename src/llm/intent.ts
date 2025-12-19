import { SchemaType, type GenerateContentRequest } from "@google-cloud/vertexai";
import type { TripState } from "./types";
import { getModel, MODELS } from "./vertex-ai";

export const getPrompt = (
    todayDate: string,
    userTranscript: string,
    currentTripState: TripState
) => {
    return `
<system_instruction>
  <role>
    You are a deterministic intent classifier for a cab / trip booking assistant.
    You operate as a finite-state machine, NOT a conversational agent.
  </role>

  <context>
    <current_date>${todayDate}</current_date>
  </context>

  <task>
    Analyze the user's input (<user_transcript>) and decide the NEXT intent based on the <current_trip_state> and strict <flow_logic>.
  </task>

  <strict_rules>
    <rule>Choose EXACTLY ONE intent from the allowed list.</rule>
    <rule>Output JSON only. No markdown, no explanations.</rule>
    <rule>Do NOT invent missing information. Use "undefined" if not specified.</rule>
    <rule>Do NOT output values outside the defined enums.</rule>
    <rule>If user says "any" or "doesn't matter", map to "none" or "XX".</rule>
    <rule>Only trip-related intents are supported.</rule>
  </strict_rules>

  <domain_knowledge>
    <enums>
      <intent>greet, ask_source, ask_destination, ask_trip_type, ask_date, ask_preferences, general, unknown</intent>
      <trip_type>one_way, round_trip, not_decided</trip_type>
      <vehicle_type>suv, sedan, hatchback, none</vehicle_type>
      <language>en, hi, bn, ta, te, mr, gu, kn, ml, pa, or, as, ur, none</language>
    </enums>

    <definitions>
      <term name="user"> The user who is creating the trip </term>
      <term name="Source">Starting location (convert to English city/place name)</term>
      <term name="Destination">Ending location (convert to English city/place name)</term>
      <term name="TripStartDate">Start date-time (dd/mm/yyyy hh:mm AM/PM). Example: 12/11/2026 12:26 PM</term>
      <term name="TripEndDate">For one_way: start + 12hrs. For round_trip: explicitly provided by user.</term>
    </definitions>
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
      AND (preferences.vehicleType is "none" OR preferences.language is "none" OR missing)
      AND (user is NOT asking a general question)
      -> SET intent="ask_preferences"
    </step>

    <step priority="4" name="General">
      IF all Mandatory Slots are filled
      AND user asks about price, availability, confirmation -> SET intent="general"
    </step>

    <step priority="5" name="Fallback">
      If unrelated to trips -> SET intent="unknown"
    </step>
  </flow_logic>

  <current_trip_state>
    ${JSON.stringify(currentTripState)}
  </current_trip_state>

  <user_transcript>
    "${userTranscript}"
  </user_transcript>

  <output_format>
    Generate a JSON object matching this schema. Do not include markdown code blocks.
  </output_format>
</system_instruction>
`;
};

export const getTripStatusWithIntent = async (userTranscript: string, tripState: TripState) => {
    console.log('calling with userTranscript')

    const currentDate = new Date();

    const indianTime = currentDate.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata"
    });

    const prompt = getPrompt(indianTime, userTranscript, tripState);
    const model = getModel(MODELS.FLASH, 512);

    const request: GenerateContentRequest = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.0,
            responseMimeType: "application/json",
            responseSchema: {
                type: SchemaType.OBJECT,
                properties: {
                    intent: { type: SchemaType.STRING },
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
                required: ["intent", "source", "destination", "tripStartDate", "tripEndDate", "tripType", "preferences", "user"]
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
