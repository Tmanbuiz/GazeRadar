import {env} from 'cloudflare:workers';
import {verifyAccessToken} from './access-token';
import {readCookie,sessionUser,SESSION_COOKIE} from './login';

export type Identity={owner:string;email:string|null};

// A signed-in email session first, then a verified Cloudflare Access token. Nothing client-supplied is trusted.
export async function identity(requestHeaders:Headers):Promise<Identity|null>{
 const cookie=readCookie(requestHeaders.get('cookie'),SESSION_COOKIE);
 if(cookie&&env.DB){const u=await sessionUser(env.DB,cookie,Date.now());if(u)return {owner:`email-otp:${u.userId}`,email:u.email};}
 const token=requestHeaders.get('cf-access-jwt-assertion');
 if(!token||!env.CF_ACCESS_TEAM_DOMAIN||!env.CF_ACCESS_AUD)return null;
 const sub=await verifyAccessToken(token,env.CF_ACCESS_TEAM_DOMAIN,env.CF_ACCESS_AUD);
 return sub?{owner:sub,email:null}:null;
}
export async function authenticatedOwner(requestHeaders:Headers):Promise<string|null>{return (await identity(requestHeaders))?.owner??null;}
