import { GenerativeModel, HarmBlockThreshold, HarmCategory, VertexAI } from "@google-cloud/vertexai";
import axios from "axios";

import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

const client = await auth.getClient();
const gcloudAccessToken = await client.getAccessToken();


const vertexAI = new VertexAI({
    project: "cabswale-ai",
    location: "asia-south1",
});


export enum MODELS {
    FLASH = "gemini-2.5-flash",
    FLASHTTS = "gemini-2.5-flash-lite-preview-tts",
    FLASHEMBEDDING = "text-multilingual-embedding-002",
    OPENEMBEDDINGLARGE = "multilingual-e5-large", // i guess we might have to self deploy
    OPENEMBEDDINGSMALL = "multilingual-e5-small" // same for this too
}

export const getModel = (modelName: MODELS, maxOutTokens: number): GenerativeModel => {
    const model = vertexAI.getGenerativeModel({
        model: modelName,
        safetySettings: [{
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
        }],
        generationConfig: { maxOutputTokens: maxOutTokens },
    });

    return model;
}

const PROJECT_ID = Bun.env?.PROJECT_ID;

const EMBEDDING_URL = `https://us-central1-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/asia-south2/publishers/google/models/${MODELS.FLASHEMBEDDING}:predict`;

export const getEmbeddings = async (text: string): Promise<number[]> => {

    const data = {
        instances: [{
            content: text
        }],
        parameters: {
            autoTruncate: true,
        }
    };


    // console.log("env: ", gcloudAccessToken.token);
    const token = gcloudAccessToken?.token;
    if (!token) {
        return [0.0]
    }

    let embeddingRequest;
    try {
        embeddingRequest = await axios.post(EMBEDDING_URL, data, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            }
        });
    } catch (e: any) {
        embeddingRequest = { data: [] }
        console.log(e.message);
    }

    const embeddingResponse = embeddingRequest.data;

    // console.dir(embeddingResponse, { depth: null })

    // console.dir(embeddingResponse?.predictions[0].embeddings.values, { depth: null });
    const embedding = embeddingResponse?.predictions[0].embeddings.values;

    if (!embedding) throw new Error("Failed to generate embedding");
    // console.log(embedding.length);
    return embedding;
}

// getEmbeddings("shuaib").then(x => { console.log(x); });
