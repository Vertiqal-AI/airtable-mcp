#!/usr/bin/env node

// src/index.ts - Modified to export server creation function
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

// Airtable field color options
const FIELD_COLORS = [
  'blueBright', 'redBright', 'greenBright',
  'yellowBright', 'purpleBright', 'pinkBright',
  'grayBright', 'cyanBright', 'orangeBright',
  'blueDark1', 'greenDark1'
] as const;

type FieldColor = typeof FIELD_COLORS[number];

// Airtable field types
interface AirtableFieldConfig {
  type: string;
  options?: {
    precision?: number;
    symbol?: string;
    dateFormat?: { name: string; format: string };
    choices?: Array<{ name: string; color?: FieldColor }>;
  };
}

// API configuration
const AIRTABLE_API_BASE = 'https://api.airtable.com/v0';

class AirtableAPIError extends Error {
  constructor(message: string, public statusCode?: number, public details?: any) {
    super(message);
    this.name = 'AirtableAPIError';
  }
}

// Helper function to make Airtable API requests
async function makeAirtableRequest(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  data?: any
) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!apiKey) {
    throw new AirtableAPIError('AIRTABLE_API_KEY environment variable is required');
  }

  try {
    const response = await axios({
      method,
      url: `${AIRTABLE_API_BASE}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      data,
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.error?.message || error.message;
      const statusCode = error.response?.status;
      throw new AirtableAPIError(message, statusCode, error.response?.data);
    }
    throw error;
  }
}

// Define available tools
const TOOLS: Tool[] = [
  {
    name: 'list_bases',
    description: 'List all accessible Airtable bases',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_tables',
    description: 'List all tables in a base',
    inputSchema: {
      type: 'object',
      properties: {
        baseId: {
          type: 'string',
          description: 'The ID of the base',
        },
      },
      required: ['baseId'],
    },
  },
  {
    name: 'create_table',
    description: 'Create a new table with fields',
    inputSchema: {
      type: 'object',
      properties: {
        baseId: {
          type: 'string',
          description: 'The ID of the base',
        },
        name: {
          type: 'string',
          description: 'The name of the table',
        },
        description: {
          type: 'string',
          description: 'The description of the table (optional)',
        },
        fields: {
          type: 'array',
          description: 'Array of field configurations',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string' },
              options: { type: 'object' }
            },
            required: ['name', 'type']
          }
        },
      },
      required: ['baseId', 'name', 'fields'],
    },
  },
  {
    name: 'create_field',
    description: 'Add a new field to a table',
    inputSchema: {
      type: 'object',
      properties: {
        baseId: {
          type: 'string',
          description: 'The ID of the base',
        },
        tableId: {
          type: 'string',
          description: 'The ID of the table',
        },
        name: {
          type: 'string',
          description: 'The name of the field',
        },
        type: {
          type: 'string',
          description: 'The type of field (singleLineText, multilineText, email, phoneNumber, number, currency, date, singleSelect, multiSelect)',
        },
        options: {
          type: 'object',
          description: 'Field-specific options (e.g., choices for select fields)',
        },
      },
      required: ['baseId', 'tableId', 'name', 'type'],
    },
  },
  {
    name: 'list_records',
    description: 'Retrieve records from a table',
    inputSchema: {
      type: 'object',
      properties: {
        baseId: {
          type: 'string',
          description: 'The ID of the base',
        },
        tableId: {
          type: 'string',
          description: 'The ID or name of the table',
        },
        maxRecords: {
          type: 'number',
          description: 'Maximum number of records to retrieve',
          default: 100,
        },
        view: {
          type: 'string',
          description: 'The name or ID of a view to use',
        },
        filterByFormula: {
          type: 'string',
          description: 'Airtable formula to filter records',
        },
        sort: {
          type: 'array',
          description: 'Sort configuration',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              direction: { type: 'string', enum: ['asc', 'desc'] }
            }
          }
        },
      },
      required: ['baseId', 'tableId'],
    },
  },
  {
    name: 'create_record',
    description: 'Create a new record in a table',
    inputSchema: {
      type: 'object',
      properties: {
        baseId: {
          type: 'string',
          description: 'The ID of the base',
        },
        tableId: {
          type: 'string',
          description: 'The ID or name of the table',
        },
        fields: {
          type: 'object',
          description: 'The fields and values for the new record',
        },
      },
      required: ['baseId', 'tableId', 'fields'],
    },
  },
  {
    name: 'update_record',
    description: 'Update an existing record',
    inputSchema: {
      type: 'object',
      properties: {
        baseId: {
          type: 'string',
          description: 'The ID of the base',
        },
        tableId: {
          type: 'string',
          description: 'The ID or name of the table',
        },
        recordId: {
          type: 'string',
          description: 'The ID of the record to update',
        },
        fields: {
          type: 'object',
          description: 'The fields and values to update',
        },
      },
      required: ['baseId', 'tableId', 'recordId', 'fields'],
    },
  },
  {
    name: 'delete_record',
    description: 'Delete a record',
    inputSchema: {
      type: 'object',
      properties: {
        baseId: {
          type: 'string',
          description: 'The ID of the base',
        },
        tableId: {
          type: 'string',
          description: 'The ID or name of the table',
        },
        recordId: {
          type: 'string',
          description: 'The ID of the record to delete',
        },
      },
      required: ['baseId', 'tableId', 'recordId'],
    },
  },
  {
    name: 'search_records',
    description: 'Find records matching criteria',
    inputSchema: {
      type: 'object',
      properties: {
        baseId: {
          type: 'string',
          description: 'The ID of the base',
        },
        tableId: {
          type: 'string',
          description: 'The ID or name of the table',
        },
        filterByFormula: {
          type: 'string',
          description: 'Airtable formula to filter records',
        },
        maxRecords: {
          type: 'number',
          description: 'Maximum number of records to return',
          default: 100,
        },
      },
      required: ['baseId', 'tableId', 'filterByFormula'],
    },
  },
  {
    name: 'get_record',
    description: 'Get a single record by its ID',
    inputSchema: {
      type: 'object',
      properties: {
        baseId: {
          type: 'string',
          description: 'The ID of the base',
        },
        tableId: {
          type: 'string',
          description: 'The ID or name of the table',
        },
        recordId: {
          type: 'string',
          description: 'The ID of the record to retrieve',
        },
      },
      required: ['baseId', 'tableId', 'recordId'],
    },
  },
];

// Create and export the MCP server
export function createAirtableMCPServer() {
  const server = new Server(
    {
      name: 'airtable-mcp-server',
      version: '0.3.1',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'list_bases':
          // Note: Airtable API doesn't provide endpoint to list bases
          // This would need to be implemented with base-specific logic
          return {
            content: [
              {
                type: 'text',
                text: 'Airtable API does not provide an endpoint to list bases. You need to specify the base ID directly.',
              },
            ],
          };

        case 'list_tables':
          const tablesData = await makeAirtableRequest(`/meta/bases/${args.baseId}/tables`);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(tablesData.tables, null, 2),
              },
            ],
          };

        case 'create_table':
          const newTable = await makeAirtableRequest(
            `/meta/bases/${args.baseId}/tables`,
            'POST',
            {
              name: args.name,
              description: args.description,
              fields: args.fields,
            }
          );
          return {
            content: [
              {
                type: 'text',
                text: `Table '${args.name}' created successfully:\n${JSON.stringify(newTable, null, 2)}`,
              },
            ],
          };

        case 'create_field':
          const newField = await makeAirtableRequest(
            `/meta/bases/${args.baseId}/tables/${args.tableId}/fields`,
            'POST',
            {
              name: args.name,
              type: args.type,
              options: args.options,
            }
          );
          return {
            content: [
              {
                type: 'text',
                text: `Field '${args.name}' created successfully:\n${JSON.stringify(newField, null, 2)}`,
              },
            ],
          };

        case 'list_records':
          const params = new URLSearchParams();
          if (args.maxRecords) params.append('maxRecords', args.maxRecords.toString());
          if (args.view) params.append('view', args.view);
          if (args.filterByFormula) params.append('filterByFormula', args.filterByFormula);
          if (args.sort) {
            args.sort.forEach((sortItem: any, index: number) => {
              params.append(`sort[${index}][field]`, sortItem.field);
              params.append(`sort[${index}][direction]`, sortItem.direction);
            });
          }

          const recordsData = await makeAirtableRequest(
            `/${args.baseId}/${args.tableId}?${params.toString()}`
          );
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(recordsData.records, null, 2),
              },
            ],
          };

        case 'create_record':
          const createdRecord = await makeAirtableRequest(
            `/${args.baseId}/${args.tableId}`,
            'POST',
            {
              fields: args.fields,
            }
          );
          return {
            content: [
              {
                type: 'text',
                text: `Record created successfully:\n${JSON.stringify(createdRecord, null, 2)}`,
              },
            ],
          };

        case 'update_record':
          const updatedRecord = await makeAirtableRequest(
            `/${args.baseId}/${args.tableId}/${args.recordId}`,
            'PATCH',
            {
              fields: args.fields,
            }
          );
          return {
            content: [
              {
                type: 'text',
                text: `Record updated successfully:\n${JSON.stringify(updatedRecord, null, 2)}`,
              },
            ],
          };

        case 'delete_record':
          await makeAirtableRequest(
            `/${args.baseId}/${args.tableId}/${args.recordId}`,
            'DELETE'
          );
          return {
            content: [
              {
                type: 'text',
                text: `Record ${args.recordId} deleted successfully`,
              },
            ],
          };

        case 'search_records':
          const searchParams = new URLSearchParams();
          searchParams.append('filterByFormula', args.filterByFormula);
          if (args.maxRecords) searchParams.append('maxRecords', args.maxRecords.toString());

          const searchData = await makeAirtableRequest(
            `/${args.baseId}/${args.tableId}?${searchParams.toString()}`
          );
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(searchData.records, null, 2),
              },
            ],
          };

        case 'get_record':
          const recordData = await makeAirtableRequest(
            `/${args.baseId}/${args.tableId}/${args.recordId}`
          );
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(recordData, null, 2),
              },
            ],
          };

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage = error instanceof AirtableAPIError 
        ? `Airtable API Error (${error.statusCode}): ${error.message}`
        : `Error: ${error.message}`;
      
      return {
        content: [
          {
            type: 'text',
            text: errorMessage,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

// CLI execution (when run directly)
async function main() {
  const server = createAirtableMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Airtable MCP Server running on stdio');
}

// Run if this file is called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}
