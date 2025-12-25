import { createError } from "../utils/http";

export const handleAudio = async (_: Request, url: URL) => {
    const filename = url.pathname.split("/").pop();
    const filePath = `src/audio/${filename}`;
    const file = Bun.file(filePath);

    if (await file.exists()) {
        return new Response(file, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "audio/mpeg"
            }
        });
    }
    return createError("Audio not found", 404);
};
