import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const server = new McpServer({
  name: "mcp-streamable-http",
  version: "1.0.0",
});

// MCP Tools

server.tool("get-chuck-joke", "Get a random Chuck Norris joke", async () => {
  const response = await fetch("https://api.chucknorris.io/jokes/random");
  const data = await response.json();
  return {
    content: [
      {
        type: "text",
        text: data.value,
      },
    ],
  };
});

server.tool(
  "get-chuck-joke-by-category",
  "Get a random Chuck Norris joke by category",
  {
    category: z.string().describe("Category of the Chuck Norris joke"),
  },
  async (params: { category: string }) => {
    const response = await fetch(
      `https://api.chucknorris.io/jokes/random?category=${params.category}`
    );
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: data.value,
        },
      ],
    };
  }
);

server.tool("get-chuck-categories", "Get Chuck Norris joke categories", async () => {
  const response = await fetch("https://api.chucknorris.io/jokes/categories");
  const data = await response.json();
  return {
    content: [
      {
        type: "text",
        text: data.join(", "),
      },
    ],
  };
});

server.tool("get-dad-joke", "Get a random dad joke", async () => {
  const response = await fetch("https://icanhazdadjoke.com/", {
    headers: { Accept: "application/json" },
  });
  const data = await response.json();
  return {
    content: [
      {
        type: "text",
        text: data.joke,
      },
    ],
  };
});

// Express app setup

const app = express();
app.use(express.json());

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});

// MCP Endpoint

app.post("/mcp", async (req: Request, res: Response) => {
  console.log("📩 Received MCP request");
  try {
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("❌ MCP error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: req.body?.id || null,
      });
    }
  }
});

// Reject GET/DELETE on /mcp

app.get("/mcp", (req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed.",
    },
    id: null,
  });
});

app.delete("/mcp", (req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed.",
    },
    id: null,
  });
});

// Root route - HTML joke

app.get("/", async (req: Request, res: Response) => {
  try {
    const jokeRes = await fetch("https://api.chucknorris.io/jokes/random");
    const jokeData = await jokeRes.json();
    res.send(`
      <html>
        <head>
          <title>Joke Server</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              background: #f8f8f8;
              display: flex;
              height: 100vh;
              align-items: center;
              justify-content: center;
            }
            .joke {
              background: #fff;
              padding: 2rem;
              border-radius: 10px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.2);
              max-width: 600px;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="joke">
            <h2>😂 Chuck Norris Joke</h2>
            <p>${jokeData.value}</p>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("❌ Failed to load joke:", err);
    res.status(500).send("Could not fetch joke.");
  }
});

// SSE endpoint - send joke every 10s

app.get("/sse", async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendJoke = async () => {
    try {
      const response = await fetch("https://api.chucknorris.io/jokes/random");
      const data = await response.json();
      res.write(`data: ${data.value}\n\n`);
    } catch {
      res.write(`data: Error fetching joke\n\n`);
    }
  };

  await sendJoke(); // immediate
  const intervalId = setInterval(sendJoke, 10000); // every 10s

  req.on("close", () => {
    clearInterval(intervalId);
    res.end();
    console.log("🔌 Client disconnected from /sse");
  });
});

// Health check route

app.get("/health", (_req, res) => {
  res.status(200).send("Healthy");
});

// Start the server

const PORT = process.env.PORT || 3000;
server
  .connect(transport)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server ready on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MCP setup failed:", err);
    process.exit(1);
  });
