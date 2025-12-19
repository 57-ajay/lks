import { SchemaType } from "@google-cloud/vertexai";
import { getModel, MODELS } from "./llm/vertex-ai";
import { INTENT, LANGUAGE, TRIP_TYPE, VEHICLE_TYPE, type TripState } from "./llm/types";
import { getPrompt } from "./llm/intent";
export const generateTest = async () => {
    const model = getModel(MODELS.FLASH, 256);

    const date = new Date();

    const indianTime = date.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour12: false,
        dateStyle: "medium",
        timeStyle: "medium"
    });

    const currentTripState: TripState = {
        intent: INTENT.GREET,
        source: "",
        destination: "",
        tripStartDate: "",
        tripEndDate: "",
        tripType: TRIP_TYPE.NOT_DECIDED,
        preferences: {
            vehicleType: VEHICLE_TYPE.NONE,
            language: LANGUAGE.XX
        },
        user: {
            id: "69",
            name: "AJAY",
            phone: "7470468734",

        }
    }

    const prompt = getPrompt(indianTime, "mai kal indore se rewa jaunga ek din k liye, wapas bhi aayenge, suv theek rahegi 5 logo k liye, aur ham sab hidi bolte hai", currentTripState)

    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.0,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
            responseSchema: {
                type: SchemaType.OBJECT,
                properties: {
                    intent: {
                        type: SchemaType.STRING,
                    },
                    source: {
                        type: SchemaType.STRING
                    },
                    destination: {
                        type: SchemaType.STRING
                    },
                    tripType: {
                        type: SchemaType.STRING
                    },
                    tripStartDate: {
                        type: SchemaType.STRING
                    },
                    tripEndDate: {
                        type: SchemaType.STRING
                    },
                    preferences: {
                        type: SchemaType.OBJECT,
                        properties: {
                            vehicleType: {
                                type: SchemaType.STRING
                            },
                            language: {
                                type: SchemaType.STRING
                            }
                        },
                        required: ["vehicleType", "language"]
                    }
                },
                required: ["intent", "source", "destination", "tripType", "tripStartDate", "tripEndDate", "preferences"]
            },
        },
    });

    if (result.response.candidates !== undefined) {
        return result.response.candidates[0]?.content.parts[0]?.text;
    }

    return null

}


