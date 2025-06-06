// server.js - Modified Airtable MCP Server for Railway deployment
import express from 'express';
import { Server as HttpServer } from 'http';
import { MCPServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport, SSEServerTransport } from '@modelcontextprotocol/sdk/server/index.js';
import Airtable from 'airtable';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3001;

// Configure CORS for n8n integration
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

// Initialize Airtable
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY });

// Create MCP Server instance
const server = new MCPServer(
  {
    name: "airtable-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define MCP Tools
const tools = [
  {
    name: "list_bases",
    description: "List all accessible Airtable bases",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_tables",
    description: "List all tables in a base",
    inputSchema: {
      type: "object",
      properties: {
        baseId: {
          type: "string",
          description: "The ID of the base",
        },
      },
      required: ["baseId"],
    },
  },
  {
    name: "list_records",
    description: "Retrieve records from a table",
    inputSchema: {
      type: "object",
      properties: {
        baseId: {
          type: "string",
          description: "The ID of the base",
        },
        tableId: {
          type: "string",
          description: "The ID or name of the table",
        },
        maxRecords: {
          type: "number",
          description: "Maximum number of records to retrieve",
          default: 100,
        },
      },
      required: ["baseId", "tableId"],
    },
  },
  {
    name: "create_record",
    description: "Create a new record in a table",
    inputSchema: {
      type: "object",
      properties: {
        baseId: {
          type: "string",
          description: "The ID of the base",
        },
        tableId: {
          type: "string",
          description: "The ID or name of the table",
        },
        fields: {
          type: "object",
          description: "The fields and values for the new record",
        },
      },
      required: ["baseId", "tableId", "fields"],
    },
  },
  {
    name: "update_record",
    description: "Update an existing record",
    inputSchema: {
      type: "object",
      properties: {
        baseId: {
          type: "string",
          description: "The ID of the base",
        },
        tableId: {
          type: "string",
          description: "The ID or name of the table",
        },
        recordId: {
          type: "string",
          description: "The ID of the record to update",
        },
        fields: {
          type: "object",
          description: "The fields and values to update",
        },
      },
      required: ["baseId", "tableId", "recordId", "fields"],
    },
  },
  {
    name: "delete_record",
    description: "Delete a record",
    inputSchema: {
      type: "object",
      properties: {
        baseId: {
          type: "string",
          description: "The ID of the base",
        },
        tableId: {
          type: "string",
          description: "The ID or name of the table",
        },
        recordId: {
          type: "string",
          description: "The ID of the record to delete",
        },
      },
      required: ["baseId", "tableId", "recordId"],
    },
  },
];

// Register tools with MCP server
server.setRequestHandler('tools/list', async () => {
  return { tools };
});

// Tool execution handler
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_bases':
        // Note: Airtable API doesn't provide a direct way to list bases
        // This would need to be implemented with base-specific logic
        return {
          content: [
            {
              type: "text",
              text: "Base listing requires specific base IDs. Please provide the base ID you want to work with.",
            },
          ],
        };

      case 'list_tables':
        const baseInstance = base.base(args.baseId);
        // Get table metadata (this is a simplified version)
        return {
          content: [
            {
              type: "text",
              text: `Connected to base ${args.baseId}. Use specific table names or IDs for operations.`,
            },
          ],
        };

      case 'list_records':
        const listBase = base.base(args.baseId);
        const records = await listBase(args.tableId)
          .select({
            maxRecords: args.maxRecords || 100,
          })
          .all();
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(records.map(r => ({ id: r.id, fields: r.fields })), null, 2),
            },
          ],
        };

      case 'create_record':
        const createBase = base.base(args.baseId);
        const newRecord = await createBase(args.tableId).create([
          {
            fields: args.fields,
          },
        ]);
        
        return {
          content: [
            {
              type: "text",
              text: `Record created successfully: ${JSON.stringify(newRecord[0], null, 2)}`,
            },
          ],
        };

      case 'update_record':
        const updateBase = base.base(args.baseId);
        const updatedRecord = await updateBase(args.tableId).update([
          {
            id: args.recordId,
            fields: args.fields,
          },
        ]);
        
        return {
          content: [
            {
              type: "text",
              text: `Record updated successfully: ${JSON.stringify(updatedRecord[0], null, 2)}`,
            },
          ],
        };

      case 'delete_record':
        const deleteBase = base.base(args.baseId);
        const deletedRecord = await deleteBase(args.tableId).destroy([args.recordId]);
        
        return {
          content: [
            {
              type: "text",
              text: `Record deleted successfully: ${args.recordId}`,
            },
          ],
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// SSE endpoint for MCP communication
app.get('/sse', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });

  const transport = new SSEServerTransport('/sse', res);
  await server.connect(transport);
  
  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write('data: {"type":"ping"}\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    transport.close();
  });
});

// REST API endpoints for direct n8n integration (alternative to SSE)
app.post('/api/tools/:toolName', async (req, res) => {
  try {
    const { toolName } = req.params;
    const args = req.body;

    // Simulate MCP tool call
    const result = await server.request(
      { method: 'tools/call', params: { name: toolName, arguments: args } },
      { id: Date.now().toString(), jsonrpc: '2.0' }
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List available tools endpoint
app.get('/api/tools', async (req, res) => {
  try {
    const result = await server.request(
      { method: 'tools/list', params: {} },
      { id: Date.now().toString(), jsonrpc: '2.0' }
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const httpServer = new HttpServer(app);

// Start server
httpServer.listen(port, () => {
  console.log(`Airtable MCP Server running on port ${port}`);
  console.log(`SSE endpoint: http://localhost:${port}/sse`);
  console.log(`REST API: http://localhost:${port}/api`);
  console.log(`Health check: http://localhost:${port}/health`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  httpServer.close(() => {
    process.exit(0);
  });
});
