// undici is bundled with Node.js 18+, types available via @types/node
import { Agent, setGlobalDispatcher } from "undici";

const httpAgent = new Agent({
  connections: 100,
  pipelining: 1,
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 600_000,
});

export { httpAgent };

export function setupGlobalHttpAgent() {
  setGlobalDispatcher(httpAgent);
}
