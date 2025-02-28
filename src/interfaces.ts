// Define response type for MCP tools
interface McpContent {
  type: string;
  text: string;
}

interface McpToolResponse {
  content: McpContent[];
}

export { McpContent, McpToolResponse };
