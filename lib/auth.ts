import {env} from 'cloudflare:workers';
import {verifyAccessToken} from './access-token';
export async function authenticatedOwner(requestHeaders:Headers):Promise<string|null>{
 const token=requestHeaders.get('cf-access-jwt-assertion');
 if(!token||!env.CF_ACCESS_TEAM_DOMAIN||!env.CF_ACCESS_AUD)return null;
 return verifyAccessToken(token,env.CF_ACCESS_TEAM_DOMAIN,env.CF_ACCESS_AUD);
}
