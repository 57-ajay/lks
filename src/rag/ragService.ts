import redis from "../redis/redis";
import { getEmbeddings } from "../llm/vertex-ai";

const INDEX_NAME = "cabswale_knowledge_idx";

export class RagService {

    async initIndex() {
        try {
            await redis.call(
                "FT.CREATE", INDEX_NAME,
                "ON", "HASH",
                "PREFIX", "1", "doc:",
                "SCHEMA",
                "content", "TEXT",
                "vector", "VECTOR", "FLAT",
                "6", // number of attributes
                "TYPE", "FLOAT32",
                "DIM", "768",
                "DISTANCE_METRIC", "COSINE"
            );
            console.log("Vector Index Created");
        } catch (e: any) {
            if (e.message.includes("Index already exists")) {
                console.log("Vector Index already exists");
            } else {
                console.error("Failed to create index", e);
            }
        }
    }

    async addDocument(id: string, content: string) {
        const vector = await getEmbeddings(content);

        const vectorBuffer = Buffer.from(new Float32Array(vector).buffer);

        await redis.hset(`doc:${id}`, {
            content: content,
            vector: vectorBuffer
        });
        console.log(`Saved doc: ${id}`);
    }

    async search(query: string, limit: number = 2): Promise<string> {
        const vector = await getEmbeddings(query);
        const vectorBuffer = Buffer.from(new Float32Array(vector).buffer);

        try {
            // KNN Vector Search Query
            const results = await redis.call(
                "FT.SEARCH", INDEX_NAME,
                `*=>[KNN ${limit} @vector $BLOB AS score]`,
                "PARAMS", "2", "BLOB", vectorBuffer,
                "SORTBY", "score", "ASC",
                "DIALECT", "2"
            ) as any[];

            // Format: [total_results, key1, [field, val...], key2, [field, val...]]
            let context = "";
            if (Array.isArray(results) && results.length > 1) {
                for (let i = 2; i < results.length; i += 2) {
                    const fields = results[i]; // this is Array of field/value pairs
                    const contentIdx = fields.indexOf("content");
                    if (contentIdx !== -1) {
                        context += fields[contentIdx + 1] + "\n\n";
                    }
                }
            }

            return context.trim();

        } catch (e) {
            console.error("Vector Search Failed", e);
            return "";
        }
    }
}

export const ragService = new RagService();
