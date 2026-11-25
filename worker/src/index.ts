import { handleMcp } from './mcp';
import { handleRequest, type Env } from './sync';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await handleMcp(request, env)) ?? handleRequest(request, env);
  },
};
