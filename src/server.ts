// src/server.ts - Railway-compatible wrapper for the existing MCP server
import express from 'express';
import { Server as HttpServer } from 'http';
import cors from 'cors';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Import the existing MCP server (you'll need to modify the original index.ts)
import { createAirtableMCPServer } from './index.js';

const app = express();
const port = process.env.PORT || 3001;

// Configure CORS for n8n integration
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize the MCP server
const mcpServer = createAirtableMCPServer();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'airtable-mcp-server',
    version: '0.3.1'
  });
});

// Server info endpoint
app.get('/info', async (req, res) => {
  try {
    const info = await mcpServer.getServerInfo();
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get server info' });
  }
});

// SSE endpoint for MCP communication
app.get('/sse', async (req, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });

  // Send initial connection message
  res.write('data: {"type":"connection","status":"connected"}\n\n');

  try {
    // Create SSE transport
    const transport = new SSEServerTransport('/sse', res);
    
    // Connect MCP server to transport
    await mcpServer.connect(transport);
    
    console.log('SSE client connected');
    
    // Keep connection alive with periodic pings
    const keepAlive = setInterval(() => {
      if (!res.destroyed) {
        res.write('data: {"type":"ping","timestamp":"' + new Date().toISOString() + '"}\n\n');
      }
    }, 30000);

    // Handle client disconnect
    req.on('close', () => {
      console.log('SSE client disconnected');
      clearInterval(keepAlive);
      transport.close?.();
    });

    req.on('error', (err) => {
      console.error('SSE connection error:', err);
      clearInterval(keepAlive);
      transport.close?.();
    });

  } catch (error) {
    console.error('SSE setup error:', error);
    res.write(`data: {"type":"error","message":"${error.message}"}\n\n`);
    res.end();
  }
});

// REST API wrapper for MCP tools
app.get('/api/tools', async (req, res) => {
  try {
    // Get list of available tools from MCP server
    const toolsResponse = await mcpServer.handleRequest({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/list',
      params: {}
    });
    
    res.json(toolsResponse.result);
  } catch (error) {
    console.error('Error listing tools:', error);
    res.status(500).json({ 
      error: 'Failed to list tools',
      message: error.message 
    });
  }
});

// REST API endpoint for calling MCP tools
app.post('/api/tools/:toolName', async (req, res) => {
  try {
    const { toolName } = req.params;
    const args = req.body;

    console.log(`Calling tool: ${toolName} with args:`, args);

    // Call the MCP tool
    const toolResponse = await mcpServer.handleRequest({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    });

    if (toolResponse.error) {
      return res.status(400).json({
        error: 'Tool execution failed',
        details: toolResponse.error
      });
    }

    res.json(toolResponse.result);
  } catch (error) {
    console.error(`Error calling tool ${req.params.toolName}:`, error);
    res.status(500).json({ 
      error: 'Tool execution failed',
      message: error.message,
      tool: req.params.toolName
    });
  }
});

// Generic MCP request handler
app.post('/api/mcp', async (req, res) => {
  try {
    const { method, params } = req.body;
    
    const response = await mcpServer.handleRequest({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params: params || {}
    });

    if (response.error) {
      return res.status(400).json(response);
    }

    res.json(response);
  } catch (error) {
    console.error('MCP request error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error.message
      }
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.originalUrl} not found`,
    availableEndpoints: [
      'GET /health',
      'GET /info', 
      'GET /sse',
      'GET /api/tools',
      'POST /api/tools/:toolName',
      'POST /api/mcp'
    ]
  });
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Create HTTP server
const httpServer = new HttpServer(app);

// Start server
async function startServer() {
  try {
    // Initialize MCP server
    console.log('Initializing Airtable MCP Server...');
    
    // Start HTTP server
    httpServer.listen(port, () => {
      console.log(`🚀 Airtable MCP Server running on port ${port}`);
      console.log(`📡 SSE endpoint: http://localhost:${port}/sse`);
      console.log(`🔗 REST API: http://localhost:${port}/api`);
      console.log(`❤️  Health check: http://localhost:${port}/health`);
      console.log(`ℹ️  Server info: http://localhost:${port}/info`);
      console.log('');
      console.log('Environment:');
      console.log(`- Node.js: ${process.version}`);
      console.log(`- NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
      console.log(`- AIRTABLE_API_KEY: ${process.env.AIRTABLE_API_KEY ? '✓ Set' : '✗ Missing'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  httpServer.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  httpServer.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
startServer();
