import { ragService } from "../rag/ragService";
import { createResponse, createError } from "../utils/http";

export const handleIngest = async (req: Request) => {
    try {
        const body = await req.json() as { id: string, text: string };
        if (!body.id || !body.text) return createError("Missing id or text");

        await ragService.addDocument(body.id, body.text);
        return createResponse({ success: true });
    } catch (e) {
        return createError("Invalid JSON", 400);
    }
};
