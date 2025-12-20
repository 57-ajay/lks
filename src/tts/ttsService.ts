import { v1beta1 } from "@google-cloud/text-to-speech";
import { MODELS } from "../llm/vertex-ai";

const client = new v1beta1.TextToSpeechClient();

export const generateAudio = async (text: string): Promise<string> => {

    const isHindi = /[\u0900-\u097F]/.test(text);
    const languageCode = isHindi ? "hi-IN" : "en-US";

    const request = {
        input: {
            prompt: "Read aloud in a warm, welcoming tone.",
            text: text
        },
        voice: {
            languageCode: languageCode,
            name: "Aoede",
            modelName: MODELS.FLASHTTS
        },
        audioConfig: {
            audioEncoding: 'MP3' as const,
            speakingRate: 1.0,
        },
    };

    console.log(`🎙️ TTS Request: Model=${request.voice.modelName}, Voice=${request.voice.name}, Lang=${languageCode}`);

    try {
        const [response] = await client.synthesizeSpeech(request);

        if (!response.audioContent) {
            throw new Error("No audio content received");
        }

        const filename = `response_${Date.now()}.mp3`;
        const filepath = `src/audio/${filename}`;

        await Bun.write(filepath, response.audioContent);

        return filename;
    } catch (error) {
        console.error("TTS Error:", error);
        return "general.mp3";
    }
}
