import { handleMcp } from './mcp';
import { handlePushRoutes } from './pushRoutes';
import { handleRequest, type Env } from './sync';

export { RestAlarm } from './restAlarm';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await handleMcp(request, env)) ?? (await handlePushRoutes(request, env)) ?? handleRequest(request, env);
  },
};
