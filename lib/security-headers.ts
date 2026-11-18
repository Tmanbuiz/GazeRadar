// Baseline browser protections added to every response. There is deliberately no script-src policy: the framework
// and the Turnstile widget rely on inline and third-party scripts, so this only blocks framing, plugins and MIME sniffing.
const HEADERS:Record<string,string>={
 'strict-transport-security':'max-age=31536000; includeSubDomains',
 'x-content-type-options':'nosniff',
 'x-frame-options':'DENY',
 'content-security-policy':"frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
 'referrer-policy':'strict-origin-when-cross-origin',
 'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};
export function withSecurityHeaders(response:Response):Response{
 if(response.status===101||response.webSocket)return response;
 const out=new Response(response.body,response);
 for(const [name,value] of Object.entries(HEADERS))if(!out.headers.has(name))out.headers.set(name,value);
 return out;
}
