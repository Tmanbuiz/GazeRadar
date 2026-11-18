import {PageError} from './monitor.ts';
// Only messages the code wrote on purpose (plain Errors and PageError) reach the client. Database, crypto and runtime
// errors are logged on the server and replaced with a generic reply, so internals never leak.
const INTERNAL=/D1_|SQLITE|no such (table|column)|constraint failed|DOMException|operation-specific|fetch failed|Network connection lost|is not a function|Cannot read prop/i;
export function failure(e:unknown){
 if(e instanceof Error&&e.message==='SIGN_IN')return Response.json({error:'Please sign in to continue.'},{status:401});
 const intended=e instanceof Error&&(e.constructor===Error||e instanceof PageError)&&!INTERNAL.test(e.message);
 if(!intended){console.error('gazeradar.request.failure',e instanceof Error?`${e.name}: ${e.message.slice(0,300)}`:'unknown');return Response.json({error:'Something went wrong. Please try again.'},{status:500});}
 return Response.json({error:e.message},{status:400});
}
