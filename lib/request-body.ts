// Bound requests before parsing. Profiles accept reviewed fields only; the application endpoint explicitly allows a bounded CV attachment.
export async function jsonBody<T extends object>(req:Request,maxBytes=12000):Promise<T> {
 if(Number(req.headers.get('content-length'))>maxBytes)throw new Error('This request is too large. Save only the reviewed profile fields.');
 const reader=req.body?.getReader();if(!reader)throw new Error('This request is empty. Please try again.');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw new Error('This request is too large. Save only the reviewed profile fields.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 let data:unknown;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Error('The request could not be read. Please try again.');}
 if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Choose valid fields and try again.');return data as T;
}
