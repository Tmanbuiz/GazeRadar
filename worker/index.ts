import handler from 'vinext/server/fetch-handler';
import {runScheduled} from '../lib/scheduler';
import {withSecurityHeaders} from '../lib/security-headers';
const worker = {
 async fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext){return withSecurityHeaders(await handler.fetch(request,env,ctx));},
 async scheduled(_controller:ScheduledController,env:Cloudflare.Env){try{if(!env.DB)throw new Error('Database is not available.');const result=await runScheduled(env.DB,env);console.log('GazeRadar scheduled run',JSON.stringify(result));}catch(error){console.error('GazeRadar scheduled run failed',error);throw error;}},
};
export default worker;
