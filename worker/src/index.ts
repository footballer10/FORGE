import { handleRequest, type Env } from './sync';

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env),
};
