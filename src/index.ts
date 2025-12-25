import { router } from "./router";
import { ragService } from "./rag/ragService";


const startServer = async (port: number) => {

    console.log("Initializing Services...");
    await ragService.initIndex();

    await ragService.addDocument("pricing_suv", "SUV costs 18rs/km.");
    await ragService.addDocument("pricing_sedan", "Sedan costs 12rs/km.");

    const server = Bun.serve({
        port: port,
        fetch: router,
    });

    console.log(`🚀 Cabswale AI Agent running on http://localhost:${server.port}`);
};

export default startServer;
