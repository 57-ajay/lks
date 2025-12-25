const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

export const createResponse = (body: any, status: number = 200, isJson: boolean = true) => {
    const headers = { ...corsHeaders };
    // @ts-ignore
    if (isJson) { headers["Content-Type"] = "application/json" };

    return new Response(isJson ? JSON.stringify(body) : body, {
        status,
        headers,
    });
};

export const createError = (message: string, status: number = 400) => {
    return createResponse({ success: false, error: message }, status);
};

export const handleOptions = () => {
    return new Response(null, { headers: corsHeaders, status: 204 });
};
