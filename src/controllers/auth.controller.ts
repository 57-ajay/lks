import { livekitService } from "../livekit/livekitService";
import { createResponse, createError } from "../utils/http";

export const handleToken = async (_: Request, url: URL) => {
    const name = url.searchParams.get("name") || "User";
    const phone = url.searchParams.get("phone");

    if (!phone) return createError("Phone required", 400);

    const roomName = `trip_${phone}`;
    const token = await livekitService.createToken(roomName, name, phone);

    return createResponse({ token, roomName });
};
