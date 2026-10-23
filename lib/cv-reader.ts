// Runs only after a file is chosen in the browser. No document is uploaded.
export async function readCV(file:File):Promise<string> {
 if(file.size>5*1024*1024)throw new Error('Choose a CV under 5 MB, or enter your skills manually.');
 const bytes=new Uint8Array(await file.arrayBuffer()),extension=file.name.split('.').pop()?.toLowerCase();
 let text='';
 if(extension==='txt')text=new TextDecoder().decode(bytes);
 else if(extension==='docx'){
  const {unzipSync}=await import('fflate');
  const files=unzipSync(bytes,{filter:f=>f.name==='word/document.xml'&&f.originalSize<=2000000});
  if(!files['word/document.xml'])throw new Error('This Word file could not be read. Try a text PDF or enter your skills manually.');
  const doc=new DOMParser().parseFromString(new TextDecoder().decode(files['word/document.xml']),'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw new Error('This Word document is not readable. Try another file.');
  text=Array.from(doc.getElementsByTagNameNS('*','p')).map(p=>Array.from(p.getElementsByTagNameNS('*','t')).map(t=>t.textContent).join('')).join('\n');
 }else if(extension==='pdf'){
  const pdf=await import('pdfjs-dist');
  const worker=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdf.GlobalWorkerOptions.workerSrc=worker.default;
  const task=pdf.getDocument({data:bytes,useSystemFonts:false,disableFontFace:true});
  try{const doc=await task.promise;if(doc.numPages>20)throw new Error('Use a CV of 20 pages or fewer, or enter skills manually.');
   for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i),c=await p.getTextContent();text+=c.items.map(x=>'str' in x?x.str:'').join(' ')+'\n';if(text.length>100000)break;}
  }finally{await task.destroy();}
 }else throw new Error('Use a PDF, DOCX or TXT file. For scanned CVs, enter your skills manually.');
 if(text.trim().length<40)throw new Error('Not enough text was found. This may be a scanned CV. Enter your skills and preferred titles manually.');
 return text.slice(0,100000);
}
